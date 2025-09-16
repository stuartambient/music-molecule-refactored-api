import { createContext, useContext } from 'react';

export const MainAudioContext = createContext();
export const useAudioPlayer = () => {
  const context = useContext(MainAudioContext);
  if (context === undefined) {
    throw new Error('useAudioPlayer must be used within an AudioPlayerProvider');
  }
  return context;
};
