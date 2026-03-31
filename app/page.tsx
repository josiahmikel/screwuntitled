"use client";

import React, { useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { usePlayerStore } from "@/store/usePlayerStore";

type Track = { id: string; title: string; duration: number };
type Project = { id: string; title: string; tracks: Track[] };

const initialProjects: Project[] = [
  {
    id: "p1",
    title: "Project 1",
    tracks: [
      { id: "t1", title: "Song 1", duration: 60 },
      { id: "t2", title: "Song 2", duration: 10 },
      { id: "t3", title: "Song 3", duration: 153 },
    ],
  },
  {
    id: "p2",
    title: "Project 2",
    tracks: [
      { id: "t4", title: "Song 1", duration: 60 },
      { id: "t5", title: "Song 2", duration: 10 },
      { id: "t6", title: "Song 3", duration: 153 },
    ],
  },
  {
    id: "p3",
    title: "Album Title",
    tracks: [
      { id: "t7", title: "Song 1", duration: 60 },
      { id: "t8", title: "Song 2", duration: 10 },
      { id: "t9", title: "Song 3", duration: 153 },
    ],
  },
  {
    id: "p4",
    title: "Butthead Musical",
    tracks: [
      { id: "t10", title: "Song 1", duration: 60 },
      { id: "t11", title: "Song 2", duration: 10 },
      { id: "t12", title: "Song 3", duration: 153 },
    ],
  },
];

function formatTime(seconds: number) {
  return `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, "0")}`;
}

// Global Audio Engine logic (hidden tag)
function BackingAudioEngine() {
  const { currentTrack, isPlaying } = usePlayerStore();
  
  if (!currentTrack) return null;
  // This would hook to the real audio_url later
  return (
    <audio 
      src={currentTrack.audio_url || undefined} 
      autoPlay={isPlaying} 
      className="hidden" 
    />
  );
}

function SortableTrackItem({ track, projectId }: { track: Track; projectId: string }) {
  const { currentTrack, isPlaying, play, pause } = usePlayerStore();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: track.id, data: { projectId } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    ...(isDragging ? { opacity: 0.9, backgroundColor: "#000", color: "#FFF" } : {}),
  };

  const isCurrent = currentTrack?.id === track.id;

  const handlePlayToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isCurrent && isPlaying) pause();
    else play(track as any);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center space-x-4 mb-1 cursor-grab active:cursor-grabbing text-sm ${isDragging ? "font-bold p-1 -m-1" : ""}`}
      {...attributes}
      {...listeners}
    >
      <button 
        onClick={handlePlayToggle}
        className={`w-12 text-left ${isCurrent && isPlaying ? "italic underline font-medium" : ""}`}
      >
        {isCurrent && isPlaying ? "Pause" : "Play"}
      </button>
      <div className={`flex-1 ${isCurrent && isPlaying ? "italic" : ""}`}>{track.title}</div>
      <div className={`w-12 text-right ${isCurrent && isPlaying ? "italic" : ""}`}>{formatTime(track.duration)}</div>
    </div>
  );
}

export default function DemosGrid() {
  const [projects, setProjects] = useState<Project[]>(initialProjects);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const findProjectOfTrack = (trackId: string) => {
    return projects.find((p) => p.tracks.some((t) => t.id === trackId));
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;
    
    // Determine active vs over project containers
    const activeId = String(active.id);
    const overId = String(over.id);

    // If hovering over a project Drop zone natively
    const activeProject = findProjectOfTrack(activeId);
    let overProject = findProjectOfTrack(overId) || projects.find(p => p.id === overId);

    if (!activeProject || !overProject || activeProject.id === overProject.id) {
      return;
    }

    setProjects((prev) => {
      const activeItems = activeProject.tracks;
      const overItems = overProject!.tracks;
      const activeIndex = activeItems.findIndex((t) => t.id === activeId);
      const overIndex = overItems.findIndex((t) => t.id === overId);
      
      const newIndex = overIndex >= 0 ? overIndex : overItems.length + 1;
      
      const next = prev.map((p) => {
        if (p.id === activeProject.id) {
          return { ...p, tracks: activeItems.filter((t) => t.id !== activeId) };
        }
        if (p.id === overProject!.id) {
          return {
            ...p,
            tracks: [
              ...overItems.slice(0, newIndex),
              activeItems[activeIndex],
              ...overItems.slice(newIndex, overItems.length),
            ],
          };
        }
        return p;
      });
      return next;
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    const trackId = String(active.id);
    const overId = String(over.id);

    const activeProject = findProjectOfTrack(trackId);
    const overProject = findProjectOfTrack(overId) || projects.find(p => p.id === overId);

    if (activeProject && overProject && activeProject.id === overProject.id) {
      const oldIndex = activeProject.tracks.findIndex((t) => t.id === trackId);
      const newIndex = overProject.tracks.findIndex((t) => t.id === overId);
      if (oldIndex !== newIndex) {
        setProjects((prev) =>
          prev.map((p) =>
            p.id === activeProject.id
              ? { ...p, tracks: arrayMove(p.tracks, oldIndex, newIndex) }
              : p
          )
        );
      }
    }
  };

  return (
    <>
      <BackingAudioEngine />
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-16 gap-y-24 items-start max-w-5xl">
          {projects.map((project) => (
            <div key={project.id} className="min-w-0">
              <h2 className="font-bold mb-6 font-sans tracking-tight">{project.title}</h2>
              
              <SortableContext
                id={project.id}
                items={project.tracks.map((t) => t.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="min-h-[20px]">
                  {project.tracks.map((track) => (
                    <SortableTrackItem key={track.id} track={track} projectId={project.id} />
                  ))}
                </div>
              </SortableContext>
              
              <button className="mt-6 text-sm hover:underline py-1">+ Add Track</button>
            </div>
          ))}

          {/* Add Project Block */}
          <div>
            <button className="font-bold mb-6 font-sans tracking-tight hover:underline">
              + Add Project
            </button>
          </div>
        </div>
      </DndContext>
    </>
  );
}
