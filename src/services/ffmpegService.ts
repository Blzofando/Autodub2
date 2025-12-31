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
    
    // URL base da CDN para a versão compatível do core
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';

    ff.on('log', ({ message }) => console.log(`[FFmpeg Log] ${message}`));
    ff.on('progress', ({ progress }) => console.log(`[FFmpeg Progress] ${Math.round(progress * 100)}%`));

    try {
      console.log("Carregando motor FFmpeg via CDN...");
      
      // Carrega os arquivos essenciais via CDN
      await ff.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      });

      console.log("Motor FFmpeg pronto.");
      ffmpeg = ff;
      return ff;
    } catch (error: any) {
      loadingPromise = null;
      console.error("Erro Crítico ao Carregar FFmpeg:", error);
      
      // Verifica se o erro é relacionado a headers de segurança
      if (error.message && (error.message.includes("SharedArrayBuffer") || error.message.includes("ReferenceError"))) {
        throw new Error("Erro de Segurança: O navegador bloqueou o FFmpeg. São necessários os headers Cross-Origin-Opener-Policy e Cross-Origin-Embedder-Policy.");
      }
      
      throw new Error(`Falha ao carregar o motor de áudio. Verifique sua conexão. Detalhe: ${error.message}`);
    }
  })();
  
  return loadingPromise;
};

export const extractAudioFromVideo = async (file: File): Promise<Blob> => {
  const ff = await loadFFmpeg();
  // Limpa caracteres especiais do nome do arquivo para evitar erros no FFmpeg
  const safeName = `input_${Date.now()}.${file.name.split('.').pop()}`; 
  const outputName = `output_${Date.now()}.mp3`;

  try {
    await ff.writeFile(safeName, await fetchFile(file));
    
    await ff.exec([
      '-i', safeName, 
      '-vn', 
      '-ar', '44100',
      '-ac', '2',
      '-b:a', '128k',
      outputName
    ]);

    const data = await ff.readFile(outputName);
    
    // Limpeza
    await ff.deleteFile(safeName);
    await ff.deleteFile(outputName);
    
    return new Blob([data], { type: 'audio/mp3' });
  } catch (e: any) {
    console.error("Erro na extração:", e);
    throw new Error("Falha ao extrair áudio do arquivo de mídia.");
  }
};

export const processAndMergeAudio = async (segments: Segment[], totalDuration: number): Promise<string> => {
  const ff = await loadFFmpeg();
  const sortedSegments = [...segments].sort((a, b) => a.start - b.start);
  const finalSegments: string[] = [];

  for (const seg of sortedSegments) {
    if (!seg.audioUrl || !seg.audioDuration) continue;
    
    const inputName = `s_in_${seg.id}.mp3`;
    const outputName = `s_out_${seg.id}.mp3`;
    
    await ff.writeFile(inputName, await fetchFile(seg.audioUrl));
    
    const targetDuration = seg.end - seg.start;
    let tempo = seg.audioDuration / targetDuration; 
    
    // Proteção contra valores extremos de tempo
    if (!isFinite(tempo) || isNaN(tempo)) tempo = 1.0;
    tempo = Math.max(0.5, Math.min(2.0, tempo));

    let atempoFilters = [];
    let tempTempo = tempo;
    
    // Filtros em cadeia para lidar com grandes alterações de velocidade
    while (tempTempo > 2.0) {
      atempoFilters.push('atempo=2.0');
      tempTempo /= 2.0;
    }
    while (tempTempo < 0.5) {
      atempoFilters.push('atempo=0.5');
      tempTempo /= 0.5;
    }
    if (tempTempo !== 1.0) {
      atempoFilters.push(`atempo=${tempTempo.toFixed(4)}`);
    }
    
    const filterString = atempoFilters.length > 0 ? atempoFilters.join(',') : 'anull';
    // Adiciona resample para garantir consistência
    const filtergraph = `${filterString},aresample=44100`;

    await ff.exec([
      '-i', inputName,
      '-af', filtergraph, 
      outputName
    ]);

    finalSegments.push(outputName);
    await ff.deleteFile(inputName);
  }

  let currentTime = 0;
  const concatFileName = 'concat.txt';
  let concatStr = '';

  for (let i = 0; i < sortedSegments.length; i++) {
    const seg = sortedSegments[i];
    const outputName = finalSegments[i];
    if (!outputName) continue;

    const gap = seg.start - currentTime;
    if (gap > 0.05) {
      const silenceName = `sil_${seg.id}.mp3`;
      await ff.exec([
        '-f', 'lavfi', 
        '-i', `anullsrc=r=44100:cl=stereo`,
        '-t', gap.toFixed(3), 
        '-q:a', '9',
        silenceName
      ]);
      concatStr += `file '${silenceName}'\n`;
    }
    
    concatStr += `file '${outputName}'\n`;
    currentTime = seg.end;
  }

  await ff.writeFile(concatFileName, concatStr);
  const finalOutput = 'dub_result.mp3';
  
  await ff.exec(['-f', 'concat', '-safe', '0', '-i', concatFileName, '-c', 'copy', finalOutput]);

  const data = await ff.readFile(finalOutput);
  const blob = new Blob([data], { type: 'audio/mp3' });
  
  // Limpeza final
  try {
     const files = await ff.listDir('.');
     for (const f of files) {
       if (!f.isDir && f.name !== finalOutput) await ff.deleteFile(f.name);
     }
  } catch(err) { console.warn("Aviso na limpeza:", err); }

  return URL.createObjectURL(blob);
};
