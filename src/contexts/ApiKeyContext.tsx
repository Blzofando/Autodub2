import React, { createContext, useContext, useState, useEffect } from 'react';
import { ApiKeys } from '../types';

interface ApiKeyContextType {
  keys: ApiKeys;
  setKeys: (keys: ApiKeys) => void;
  saveKeys: (keys: ApiKeys) => void;
  hasKeys: boolean;
}

const ApiKeyContext = createContext<ApiKeyContextType | undefined>(undefined);

const STORAGE_KEY = 'autodub_api_keys';

export const ApiKeyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [keys, setKeysState] = useState<ApiKeys>({
    geminiKey: '',
    openaiKey: ''
  });

  // Load from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        setKeysState(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse saved keys", e);
      }
    }
  }, []);

  const saveKeys = (newKeys: ApiKeys) => {
    setKeysState(newKeys);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newKeys));
  };

  const hasKeys = !!keys.geminiKey && !!keys.openaiKey;

  return (
    <ApiKeyContext.Provider value={{ keys, setKeys: setKeysState, saveKeys, hasKeys }}>
      {children}
    </ApiKeyContext.Provider>
  );
};

export const useApiKeys = () => {
  const context = useContext(ApiKeyContext);
  if (!context) throw new Error('useApiKeys must be used within ApiKeyProvider');
  return context;
};
