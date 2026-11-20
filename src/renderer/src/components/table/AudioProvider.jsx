import { useRef, useState, useEffect } from 'react';
import { AudioContext } from './audioContext';

export const AudioProvider = ({ children }) => {
  const audioRef = useRef(null);
  if (!audioRef.current) audioRef.current = new Audio();
  const [currentTrack, setCurrentTrack] = useState(null);
  const [volume, setVolume] = useState(1);

  const playTrack = (track) => {
    if (currentTrack !== track) {
      audioRef.current.pause();
      audioRef.current.src = `streaming://${track}`;
      audioRef.current.play();
      setCurrentTrack(track);
    } else {
      audioRef.current.pause();
      setCurrentTrack(null);
    }
  };

  const stopTrack = () => {
    audioRef.current.pause();
    audioRef.current.currentTime = 0;
    setCurrentTrack(null);
  };

  const changeVolume = (newVolume) => {
    audioRef.current.volume = newVolume;
    setVolume(newVolume);
  };

  useEffect(() => {
    const audio = audioRef.current;
    const handleResetAudio = () => stopTrack();
    window.addEventListener('resetAudio', handleResetAudio);

    return () => {
      window.removeEventListener('resetAudio', handleResetAudio);
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    };
  }, []);

  return (
    <AudioContext.Provider value={{ currentTrack, playTrack, stopTrack, volume, changeVolume }}>
      {children}
    </AudioContext.Provider>
  );
};
