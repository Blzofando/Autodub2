import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import { Segment } from '../types';

let ffmpeg: FFmpeg | null = null;
let loadingPromise: Promise<FFmpeg> | null = null;

export const loadFFmpeg = (): Promise<FFmpeg> => {
  if (ffmpeg) return Promise.resolve(ffmpeg);
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    const ff = new FFmpeg(); 
    
    // Vite serve ativos do diretório 'public' na raiz.
    // O usuário deve colocar os arquivos do core do FFmpeg em 'public/ffmpeg-core/'.
    const baseURL = '/ffmpeg-core';
    
    ff.on('log', ({ message }) => console.log(`[FFmpeg Log] ${message}`));
    ff.on('progress', ({ progress }) => console.log(`[FFmpeg Progress] ${Math.round(progress * 100)}%`));

    try {
      console.log("Carregando componentes do motor FFmpeg do caminho local...");
      
      await ff.load({
        coreURL: `${baseURL}/ffmpeg-core.js`,
        wasmURL: `${baseURL}/ffmpeg-core.wasm`,
      });

      console.log("Motor FFmpeg pronto.");
      ffmpeg = ff;
      return ff;
    } catch (error: any) {
      loadingPromise = null; 
      console.error("Erro Crítico ao Carregar FFmpeg:", error);
      
      if (!crossOriginIsolated) {
        throw new Error("O FFmpeg requer um ambiente isolado de origem cruzada. Certifique-se de que os cabeçalhos corretos (Cross-Origin-Opener-Policy: same-origin, Cross-Origin-Embedder-Policy: require-corp) estão configurados no seu servidor. O arquivo vercel.json deve cuidar disso no deploy.");
      }
      
      throw new Error(`Falha ao inicializar o motor de áudio: Ocorreu um erro inesperado. Erro detalhado: ${error.message || 'Erro Desconhecido'}`);
    }
  })();
  
  return loadingPromise;
};

export const extractAudioFromVideo = async (file: File): Promise<Blob> => {
  const ff = await loadFFmpeg();
  const inputName = `input_${Date.now()}`;
  const outputName = `output_${Date.now()}.mp3`;

  try {
    await ff.writeFile(inputName, await fetchFile(file));
    
    await ff.exec([
      '-i', inputName, 
      '-vn', 
      '-ar', '44100',
      '-ac', '2',
      '-b:a', '128k',
      outputName
    ]);

    const data = await ff.readFile(outputName);
    
    await ff.deleteFile(inputName);
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
    tempo = Math.max(0.5, Math.min(2.0, tempo));

    let atempoFilters = [];
    while (tempo > 2.0) {
      atempoFilters.push('atempo=2.0');
      tempo /= 2.0;
    }
    while (tempo < 0.5) {
      atempoFilters.push('atempo=0.5');
      tempo /= 0.5;
    }
    if (tempo !== 1.0) {
      atempoFilters.push(`atempo=${tempo.toFixed(4)}`);
    }
    const atempoFilterString = atempoFilters.join(',');

    const filtergraph = atempoFilterString + (atempoFilterString ? ',' : '') + 'aresample=44100';

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
  
  try {
     const files = await ff.listDir('.');
     for (const f of files) {
       if (!f.isDir) await ff.deleteFile(f.name);
     }
  } catch(err) { console.warn("Aviso na limpeza:", err); }

  return URL.createObjectURL(blob);
};
