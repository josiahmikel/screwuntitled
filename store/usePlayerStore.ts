import { create } from 'zustand';

interface Track {
  id: string;
  title: string;
  artist: string;
  duration: number;
  audio_url: string | null;
}

interface PlayerState {
  currentTrack: Track | null;
  isPlaying: boolean;
  volume: number;
  pitch: number;
  playbackRate: number;
  play: (track?: Track) => void;
  pause: () => void;
  togglePlay: () => void;
  setPitch: (pitch: number) => void;
  setPlaybackRate: (rate: number) => void;
}

export const usePlayerStore = create<PlayerState>((set) => ({
  currentTrack: null,
  isPlaying: false,
  volume: 1,
  pitch: 0,
  playbackRate: 1,
  play: (track) => set((state) => ({ 
    currentTrack: track || state.currentTrack, 
    isPlaying: true 
  })),
  pause: () => set({ isPlaying: false }),
  togglePlay: () => set((state) => ({ isPlaying: !state.isPlaying })),
  setPitch: (pitch) => set({ pitch }),
  setPlaybackRate: (playbackRate) => set({ playbackRate }),
}));
