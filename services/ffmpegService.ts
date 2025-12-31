import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import { Segment } from '../types';

let ffmpeg: FFmpeg | null = null;
let loadingPromise: Promise<FFmpeg> | null = null;

// Utility to convert a CDN URL to a Blob URL
const toBlobURL = async (url: string, mimeType: string): Promise<string> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
  }
  const blob = await response.blob();
  return URL.createObjectURL(new Blob([blob], { type: mimeType }));
};

/**
 * Loads FFmpeg using the Single-Threaded (ST) core and direct CDN URLs,
 * converting them to Blob URLs to bypass cross-origin security restrictions.
 */
export const loadFFmpeg = (): Promise<FFmpeg> => {
  if (ffmpeg) return Promise.resolve(ffmpeg);
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    const ff = new FFmpeg(); 
    
    // Using ST (Single Threaded) version 0.12.6 which is stable and widely available.
    // NOTE: 0.12.15 core-st might not exist on all CDNs, causing Load Error.
    const coreBaseUrl = 'https://unpkg.com/@ffmpeg/core-st@0.12.6/dist/esm';
    
    ff.on('log', ({ message }) => console.log(`[FFmpeg Log] ${message}`));
    ff.on('progress', ({ progress }) => console.log(`[FFmpeg Progress] ${Math.round(progress * 100)}%`));

    try {
      console.log("Loading FFmpeg engine components...");
      
      // Fetch and convert core and WASM files to Blob URLs
      const coreURLBlob = await toBlobURL(`${coreBaseUrl}/ffmpeg-core.js`, 'text/javascript');
      const wasmURLBlob = await toBlobURL(`${coreBaseUrl}/ffmpeg-core.wasm`, 'application/wasm');
      
      console.log("Generated URLs:");
      console.log("  Core Blob:", coreURLBlob);
      console.log("  WASM Blob:", wasmURLBlob);

      await ff.load({
        coreURL: coreURLBlob,
        wasmURL: wasmURLBlob,
        // workerURL is omitted for @ffmpeg/core-st as its worker logic is typically in core.js for ST builds
      });

      console.log("FFmpeg engine ready.");
      ffmpeg = ff;
      return ff;
    } catch (error: any) {
      loadingPromise = null; 
      console.error("FFmpeg Load Error Critical:", error);
      
      // More specific checks for known errors
      if (error.message?.includes('insecure') || error.name === 'SecurityError') {
         throw new Error("Security Error: Your browser is blocking the audio engine. Ensure your connection is secure (HTTPS) and try with a browser like Chrome. This often happens on HTTP connections.");
      }
      if (error.message?.includes('Failed to fetch')) {
        throw new Error(`Network Error: Failed to download FFmpeg core files. Please check your internet connection. Detailed error: ${error.message}`);
      }
      
      // Generic fallback for other errors
      throw new Error(`Failed to initialize audio engine: An unexpected error occurred. Detailed error: ${error.message || 'Unknown Error'}`);
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
    
    // Extract audio: 128k mp3, 44100Hz, stereo
    await ff.exec([
      '-i', inputName, 
      '-vn', 
      '-ar', '44100',
      '-ac', '2',
      '-b:a', '128k',
      outputName
    ]);

    const data = await ff.readFile(outputName);
    
    // Cleanup FS
    await ff.deleteFile(inputName);
    await ff.deleteFile(outputName);
    
    return new Blob([data], { type: 'audio/mp3' });
  } catch (e: any) {
    console.error("Extraction error:", e);
    throw new Error("Failed to extract audio from media file.");
  }
};

export const processAndMergeAudio = async (segments: Segment[], totalDuration: number): Promise<string> => {
  const ff = await loadFFmpeg();
  const sortedSegments = [...segments].sort((a, b) => a.start - b.start);
  const finalSegments: string[] = [];

  // 1. Process each segment (Time Stretching)
  for (const seg of sortedSegments) {
    if (!seg.audioUrl || !seg.audioDuration) continue;
    
    const inputName = `s_in_${seg.id}.mp3`;
    const outputName = `s_out_${seg.id}.mp3`;
    
    await ff.writeFile(inputName, await fetchFile(seg.audioUrl));
    
    const targetDuration = seg.end - seg.start;
    let tempo = seg.audioDuration / targetDuration; 
    // Clamp tempo to reasonable values to avoid extreme stretching artifacts
    tempo = Math.max(0.5, Math.min(2.0, tempo)); // Allow stretching from 0.5x to 2.0x speed

    // Stretch to fit slot perfectly while preserving pitch
    // 'atempo' filter must be between 0.5 and 2.0, so we apply it multiple times if needed.
    let atempoFilters = [];
    while (tempo > 2.0) {
      atempoFilters.push('atempo=2.0');
      tempo /= 2.0;
    }
    while (tempo < 0.5) {
      atempoFilters.push('atempo=0.5');
      tempo /= 0.5;
    }
    if (tempo !== 1.0) { // Only add if it's not effectively 1.0 to avoid unnecessary filter
      atempoFilters.push(`atempo=${tempo.toFixed(4)}`);
    }
    const atempoFilterString = atempoFilters.join(',');

    // Ensure audio is resampled to a common rate like 44.1kHz for consistent processing
    const filtergraph = atempoFilterString + (atempoFilterString ? ',' : '') + 'aresample=44100';

    await ff.exec([
      '-i', inputName,
      '-af', filtergraph, 
      outputName
    ]);

    finalSegments.push(outputName);
    await ff.deleteFile(inputName);
  }

  // 2. Concatenate with Silence
  let currentTime = 0;
  const concatFileName = 'concat.txt';
  let concatStr = '';

  for (let i = 0; i < sortedSegments.length; i++) {
    const seg = sortedSegments[i];
    const outputName = finalSegments[i];
    if (!outputName) continue;

    const gap = seg.start - currentTime;
    if (gap > 0.05) { // Only add silence if gap is significant
      const silenceName = `sil_${seg.id}.mp3`;
      await ff.exec([
        '-f', 'lavfi', 
        '-i', `anullsrc=r=44100:cl=stereo`, // Generate stereo silence at 44100Hz, stereo
        '-t', gap.toFixed(3), 
        '-q:a', '9', // low quality for silence to save space
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
  
  // Cleanup everything in memory FS
  try {
     const files = await ff.listDir('.');
     for (const f of files) {
       if (!f.isDir) await ff.deleteFile(f.name);
     }
  } catch(err) { console.warn("Cleanup warning:", err); }

  return URL.createObjectURL(blob);
};