import React, { useRef } from 'react';
import { UploadCloud, FileVideo } from 'lucide-react';
import { useProject } from '../contexts/ProjectContext';

export const FileUpload: React.FC = () => {
  const { setFile, file } = useProject();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    if (input.files && input.files[0]) {
      setFile(input.files[0]);
    }
  };

  return (
    <div className="w-full p-8 border-2 border-dashed border-slate-700 rounded-2xl bg-surface/50 hover:bg-surface/80 transition group cursor-pointer"
         onClick={() => inputRef.current?.click()}>
      <input 
        type="file" 
        ref={inputRef} 
        onChange={handleFile} 
        accept="video/mp4,audio/mp3" 
        className="hidden" 
      />
      
      <div className="flex flex-col items-center text-center">
        {file ? (
          <>
            <div className="w-16 h-16 bg-accent/20 text-accent rounded-full flex items-center justify-center mb-4">
              <FileVideo size={32} />
            </div>
            <h3 className="text-lg font-semibold text-white">{file.name}</h3>
            <p className="text-slate-400 text-sm mt-1">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
          </>
        ) : (
          <>
            <div className="w-16 h-16 bg-slate-700/50 text-slate-400 group-hover:text-primary group-hover:bg-primary/20 rounded-full flex items-center justify-center mb-4 transition">
              <UploadCloud size={32} />
            </div>
            <h3 className="text-lg font-semibold text-white">Upload Media</h3>
            <p className="text-slate-400 text-sm mt-1">Supports MP4 or MP3</p>
          </>
        )}
      </div>
    </div>
  );
};