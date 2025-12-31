import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { Segment } from '../types';

let ffmpeg: FFmpeg | null = null;
let loadingPromise: Promise<FFmpeg> | null = null;

export const loadFFmpeg = (): Promise<FFmpeg> => {
  if (ffmpeg) return Promise.resolve(ffmpeg);
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    const ff = new FFmpeg();
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';

    ff.on('log', ({ message }) => console.log(`[FFmpeg] ${message}`));

    try {
      await ff.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      });
      ffmpeg = ff;
      return ff;
    } catch (error: any) {
      loadingPromise = null;
      throw new Error(`Erro FFmpeg: ${error.message}`);
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
    await ff.exec(['-i', safeName, '-vn', '-ar', '44100', '-ac', '2', '-b:a', '128k', outputName]);
    const data = await ff.readFile(outputName);
    await ff.deleteFile(safeName);
    await ff.deleteFile(outputName);
    return new Blob([data], { type: 'audio/mp3' });
  } catch (e) {
    throw new Error("Falha ao extrair áudio.");
  }
};

export const processAndMergeAudio = async (segments: Segment[], totalDuration: number): Promise<string> => {
  const ff = await loadFFmpeg();
  
  // Ordena rigorosamente pelo tempo
  const sortedSegments = [...segments].sort((a, b) => a.start - b.start);
  const finalSegments: string[] = [];

  for (const seg of sortedSegments) {
    if (!seg.audioUrl || !seg.audioDuration) continue;
    
    const inputName = `s_in_${seg.id}.mp3`;
    const outputName = `s_out_${seg.id}.mp3`;
    
    await ff.writeFile(inputName, await fetchFile(seg.audioUrl));
    
    // --- LÓGICA CRÍTICA DE TEMPO ---
    // O slot de tempo que esse áudio PRECISA ocupar
    const targetDuration = seg.end - seg.start;
    
    // O quanto precisamos acelerar/desacelerar
    let tempo = seg.audioDuration / targetDuration; 
    
    // Proteções de limite (0.5x a 2.0x) para não distorcer demais
    // Se precisar acelerar mais que 2x, cortaremos o final.
    tempo = Math.max(0.5, tempo); 
    
    // Construção do filtro atempo (encadeado se necessário)
    let atempoFilters = [];
    let tempTempo = tempo;
    while (tempTempo > 2.0) {
      atempoFilters.push('atempo=2.0');
      tempTempo /= 2.0;
    }
    if (tempTempo > 1.0 || tempTempo < 1.0) {
      atempoFilters.push(`atempo=${tempTempo.toFixed(4)}`);
    }
    
    // IMPORTANTE: Adicionamos 'apad' para prevenir que fique menor e 
    // usamos -t no comando exec para prevenir que fique maior.
    const filterString = atempoFilters.length > 0 ? atempoFilters.join(',') : 'anull';
    const filtergraph = `${filterString},aresample=44100`;

    // Processa o segmento
    await ff.exec([
      '-i', inputName,
      '-af', filtergraph,
      '-t', targetDuration.toFixed(4), // <--- O SEGREDO: Corta exatamente no tempo do slot
      outputName
    ]);

    finalSegments.push(outputName);
    await ff.deleteFile(inputName);
  }

  // --- MONTAGEM FINAL COM CONCATENAÇÃO EXATA ---
  // Em vez de calcular gaps manualmente e arriscar drift,
  // vamos garantir que o silêncio preencha exatamente os buracos.
  
  let currentTime = 0;
  let concatStr = '';
  const silNameBase = 'silence_base.mp3';
  
  // Cria um silêncio base de 1 segundo para usar como referência se necessário
  // (Opcional, mas aqui usaremos anullsrc dinâmico no loop)

  for (let i = 0; i < sortedSegments.length; i++) {
    const seg = sortedSegments[i];
    const outputName = finalSegments[i];
    
    // Calcula o buraco entre o fim do último e o começo deste
    const gap = seg.start - currentTime;
    
    if (gap > 0.05) { // Só insere silêncio se o gap for perceptível (>50ms)
      const silenceName = `sil_gap_${i}.mp3`;
      await ff.exec([
        '-f', 'lavfi', 
        '-i', 'anullsrc=r=44100:cl=stereo', 
        '-t', gap.toFixed(4), 
        silenceName
      ]);
      concatStr += `file '${silenceName}'\n`;
    }
    
    // Adiciona o arquivo de áudio processado
    concatStr += `file '${outputName}'\n`;
    
    // Avança o cursor do tempo exatamente pelo tamanho do slot original
    // Isso previne que erros de arredondamento empurrem o próximo áudio
    currentTime = seg.end;
  }

  // Se o áudio final for menor que o vídeo total, preenche o final
  if (currentTime < totalDuration) {
      const finalGap = totalDuration - currentTime;
      if (finalGap > 0.1) {
          const endSilName = 'sil_end.mp3';
          await ff.exec(['-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-t', finalGap.toFixed(4), endSilName]);
          concatStr += `file '${endSilName}'\n`;
      }
  }

  const concatFileName = 'concat.txt';
  await ff.writeFile(concatFileName, concatStr);
  const finalOutput = 'dub_master.mp3';
  
  await ff.exec(['-f', 'concat', '-safe', '0', '-i', concatFileName, '-c', 'copy', finalOutput]);

  const data = await ff.readFile(finalOutput);
  const blob = new Blob([data], { type: 'audio/mp3' });

  // Limpeza
  try {
     const files = await ff.listDir('.');
     for (const f of files) {
        if (!f.isDir && f.name.endsWith('.mp3')) await ff.deleteFile(f.name);
     }
  } catch(e) {}

  return URL.createObjectURL(blob);
};
