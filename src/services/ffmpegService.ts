import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { Segment } from '../types';

let ffmpeg: FFmpeg | null = null;
let loadingPromise: Promise<FFmpeg> | null = null;

// Função auxiliar para verificar erros do FFmpeg
const execCommand = async (ff: FFmpeg, args: string[]) => {
  console.log(`[FFmpeg Command] Executing: ffmpeg ${args.join(' ')}`);
  const ret = await ff.exec(args);
  if (ret !== 0) {
    throw new Error(`FFmpeg command failed with code ${ret}: ffmpeg ${args.join(' ')}`);
  }
  return ret;
};

export const loadFFmpeg = (): Promise<FFmpeg> => {
  if (ffmpeg) return Promise.resolve(ffmpeg);
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    const ff = new FFmpeg();
    
    // Usando versão 0.12.10 que é muito mais estável
    // NOTA: Se continuar falhando no iPhone, pode ser necessário usar a versão single-threaded (sem mt)
    // Mas requer configuração correta de headers no vercel.json
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';

    ff.on('log', ({ message }) => console.log(`[FFmpeg Core] ${message}`));

    try {
      console.log("Iniciando carga do FFmpeg...");
      
      await ff.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      });

      console.log("FFmpeg carregado com sucesso.");
      ffmpeg = ff;
      return ff;
    } catch (error: any) {
      loadingPromise = null;
      console.error("Falha no carregamento do FFmpeg:", error);
      
      // Detecção de erro de SharedArrayBuffer (comum em Mobile/Safari sem headers HTTPS corretos)
      if (!window.crossOriginIsolated) {
        throw new Error("Erro de Segurança: O navegador bloqueou o FFmpeg. O site precisa de headers 'Cross-Origin-Embedder-Policy: require-corp' e 'Cross-Origin-Opener-Policy: same-origin'. Verifique seu arquivo vercel.json.");
      }
      
      throw new Error(`Falha ao carregar motor de áudio: ${error.message || 'Erro Desconhecido'}`);
    }
  })();
  
  return loadingPromise;
};

export const extractAudioFromVideo = async (file: File): Promise<Blob> => {
  const ff = await loadFFmpeg();
  const safeName = `input_${Date.now()}.${file.name.split('.').pop()}`; 
  const outputName = `output_${Date.now()}.mp3`;

  try {
    await ff.writeFile(safeName, await fetchFile(file));
    
    await execCommand(ff, [
      '-i', safeName, 
      '-vn', 
      '-ar', '44100',
      '-ac', '2',
      '-b:a', '128k',
      outputName
    ]);

    const data = await ff.readFile(outputName);
    
    await ff.deleteFile(safeName);
    await ff.deleteFile(outputName);
    
    return new Blob([data], { type: 'audio/mp3' });
  } catch (e: any) {
    console.error("Erro na extração:", e);
    throw new Error(`Falha ao extrair áudio: ${e.message}`);
  }
};

export const processAndMergeAudio = async (segments: Segment[], totalDuration: number): Promise<string> => {
  const ff = await loadFFmpeg();
  
  // Ordenação garantida
  const sortedSegments = [...segments].sort((a, b) => a.start - b.start);
  const finalSegments: string[] = [];

  try {
    // 1. Processamento Individual dos Segmentos (Time Stretching)
    for (const seg of sortedSegments) {
      if (!seg.audioUrl) continue;
      
      const inputName = `s_in_${seg.id}.mp3`;
      const outputName = `s_out_${seg.id}.mp3`;
      
      // Escreve o arquivo no sistema virtual
      await ff.writeFile(inputName, await fetchFile(seg.audioUrl));
      
      // Cálculos de tempo
      const targetDuration = seg.end - seg.start;
      // Se não tiver duração do áudio, assume a duração alvo (sem stretch)
      const currentDuration = seg.audioDuration || targetDuration; 
      
      let tempo = currentDuration / targetDuration; 
      
      // Limites de segurança para evitar "voz de esquilo" extrema ou crash
      tempo = Math.max(0.5, Math.min(100.0, tempo)); // Liberado limite superior para caber no tempo

      // Filtro atempo em cadeia
      let atempoFilters = [];
      let tempTempo = tempo;
      while (tempTempo > 2.0) {
        atempoFilters.push('atempo=2.0');
        tempTempo /= 2.0;
      }
      if (tempTempo !== 1.0) {
        atempoFilters.push(`atempo=${tempTempo.toFixed(4)}`);
      }
      
      const filterString = atempoFilters.length > 0 ? atempoFilters.join(',') : 'anull';
      const filtergraph = `${filterString},aresample=44100`;

      // Executa o processamento
      // O flag -t é CRUCIAL: corta o áudio se ficar maior que o slot de tempo
      await execCommand(ff, [
        '-i', inputName,
        '-af', filtergraph,
        '-t', targetDuration.toFixed(4), 
        outputName
      ]);

      finalSegments.push(outputName);
      // Limpa entrada para economizar memória
      await ff.deleteFile(inputName);
    }

    // 2. Concatenação Inteligente
    let currentTime = 0;
    let concatStr = '';
    
    // Cria um arquivo de silêncio base para reusar (performance)
    // await execCommand(ff, ['-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-t', '0.1', 'silence_base.mp3']);

    for (let i = 0; i < sortedSegments.length; i++) {
      const seg = sortedSegments[i];
      const outputName = finalSegments[i];
      if (!outputName) continue; // Pula se falhou no passo anterior

      // Calcula gap (silêncio necessário antes deste segmento)
      const gap = seg.start - currentTime;
      
      if (gap > 0.02) { // Só insere silêncio se for maior que 20ms
        const silenceName = `sil_gap_${i}.mp3`;
        // Gera silêncio dinâmico do tamanho exato do buraco
        await execCommand(ff, [
          '-f', 'lavfi', 
          '-i', 'anullsrc=r=44100:cl=stereo', 
          '-t', gap.toFixed(4), 
          silenceName
        ]);
        concatStr += `file '${silenceName}'\n`;
      }
      
      concatStr += `file '${outputName}'\n`;
      currentTime = seg.end;
    }

    // Preenche o final se necessário (para bater com o vídeo original)
    if (currentTime < totalDuration) {
       const finalGap = totalDuration - currentTime;
       if (finalGap > 0.1) {
          const endSilName = 'sil_end.mp3';
          await execCommand(ff, [
            '-f', 'lavfi', 
            '-i', 'anullsrc=r=44100:cl=stereo', 
            '-t', finalGap.toFixed(4), 
            endSilName
          ]);
          concatStr += `file '${endSilName}'\n`;
       }
    }

    // 3. Renderização Final
    const concatFileName = 'concat.txt';
    await ff.writeFile(concatFileName, concatStr);
    
    const tempOutput = 'temp_master.mp3';
    
    // Concatena tudo
    await execCommand(ff, [
        '-f', 'concat', 
        '-safe', '0', 
        '-i', concatFileName, 
        '-c', 'copy', 
        tempOutput
    ]);

    // Corte de segurança final (Garante duração exata do vídeo)
    const finalOutput = 'dub_master.mp3';
    await execCommand(ff, [
        '-i', tempOutput,
        '-t', totalDuration.toFixed(4),
        '-c', 'copy',
        finalOutput
    ]);

    // Leitura do arquivo final
    const data = await ff.readFile(finalOutput);
    const blob = new Blob([data], { type: 'audio/mp3' });
    
    // Limpeza agressiva para liberar memória no celular
    try {
       const files = await ff.listDir('.');
       for (const f of files) {
         if (!f.isDir && (f.name.endsWith('.mp3') || f.name.endsWith('.txt'))) {
             await ff.deleteFile(f.name);
         }
       }
    } catch(err) { console.warn("Aviso na limpeza:", err); }

    return URL.createObjectURL(blob);

  } catch (err: any) {
    console.error("Erro no processamento de áudio:", err);
    // Retorna mensagem de erro detalhada para o popup
    throw new Error(err.message || "Erro desconhecido durante a mixagem");
  }
};
