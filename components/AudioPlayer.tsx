"use client";

import React, { useEffect, useRef, useState } from 'react';
import { usePlayerStore } from '@/store/usePlayerStore';

export default function AudioPlayer() {
  const { currentTrack, isPlaying, volume, play, pause, togglePlay } = usePlayerStore();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!audioRef.current) return;
    
    if (isPlaying) {
      audioRef.current.play().catch(console.error);
    } else {
      audioRef.current.pause();
    }
  }, [isPlaying, currentTrack]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateProgress = () => {
      if (audio.duration) {
        setProgress((audio.currentTime / audio.duration) * 100);
      }
    };

    audio.addEventListener('timeupdate', updateProgress);
    return () => audio.removeEventListener('timeupdate', updateProgress);
  }, []);

  if (!currentTrack) {
    return (
      <div className="p-2 border-t border-black bg-white flex justify-between items-center text-sm font-mono">
        <span>STATUS: IDLE</span>
        <span>NO FILE SELECTED</span>
        <span>[00:00]</span>
      </div>
    );
  }

  // ASCII Progress Bar generation
  const barLength = 20;
  const filledBars = Math.floor((progress / 100) * barLength);
  const emptyBars = barLength - filledBars;
  const asciiProgress = `[${'='.repeat(filledBars)}${'-'.repeat(emptyBars)}]`;

  return (
    <div className="p-2 border-t border-black bg-white flex justify-between items-center text-sm font-mono flex-wrap">
      <audio ref={audioRef} src={currentTrack.audio_url || undefined} loop={false} />
      
      {/* Current Track Info */}
      <div className="flex space-x-4 items-center min-w-[300px]">
        <span className="font-bold border border-black px-1">FILE:</span>
        <span className="truncate">{currentTrack.title}</span>
      </div>
      
      {/* Controls & Progress */}
      <div className="flex space-x-6 items-center">
        <button className="hover:bg-black hover:text-white px-1 border border-transparent hover:border-black cursor-pointer font-bold transition-none">
          {'[<<]'}
        </button>
        <button 
          onClick={togglePlay}
          className="hover:bg-black hover:text-white px-2 border border-black cursor-pointer font-bold bg-white text-black transition-none"
        >
          {isPlaying ? '[ PAUSE ]' : '[ PLAY ]'}
        </button>
        <button className="hover:bg-black hover:text-white px-1 border border-transparent hover:border-black cursor-pointer font-bold transition-none">
          {'[>>]'}
        </button>
        
        <div className="flex items-center space-x-2 w-48 font-mono text-xs">
          <span>{asciiProgress}</span>
        </div>
      </div>

      {/* Meta Info */}
      <div className="min-w-[150px] text-right">
        <span>RATE: 1.0x</span>
      </div>
    </div>
  );
}
