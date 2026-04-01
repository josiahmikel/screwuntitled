import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { v4 as uuidv4 } from 'uuid';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';
const socket = io(SERVER_URL);

// helper
const reorder = (list, startIndex, endIndex) => {
  const result = Array.from(list);
  const [removed] = result.splice(startIndex, 1);
  result.splice(endIndex, 0, removed);
  return result;
};

const formatTime = (seconds) => {
  if (!seconds || isNaN(seconds) || seconds === Infinity) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
};

const parseTime = (timeStr) => {
  if (!timeStr) return 0;
  const parts = timeStr.split(':');
  if (parts.length === 2) return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
  if (parts.length === 3) return parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + parseInt(parts[2], 10);
  return 0;
};

const ScrollableTitle = ({ text }) => {
  const containerRef = useRef(null);
  const textRef = useRef(null);
  const [shouldScroll, setShouldScroll] = useState(false);

  useEffect(() => {
    if (containerRef.current && textRef.current) {
      setShouldScroll(textRef.current.scrollWidth > containerRef.current.clientWidth);
    }
  }, [text]);

  return (
    <div 
      ref={containerRef} 
      className="track-title-container" 
      style={{ 
        flex: 1, 
        overflow: 'hidden', 
        maskImage: shouldScroll ? 'linear-gradient(to right, black 90%, transparent 100%)' : 'none',
        WebkitMaskImage: shouldScroll ? 'linear-gradient(to right, black 90%, transparent 100%)' : 'none',
        whiteSpace: 'nowrap'
      }}
    >
      <span 
        ref={textRef} 
        className={`track-title ${shouldScroll ? 'scrollable' : ''}`}
        style={{ 
          display: 'inline-block',
          textOverflow: shouldScroll ? 'clip' : 'ellipsis',
          overflow: shouldScroll ? 'visible' : 'hidden',
          width: shouldScroll ? 'auto' : '100%'
        }}
        onMouseEnter={(e) => {
          if (shouldScroll) {
            const dist = textRef.current.scrollWidth - containerRef.current.clientWidth;
            e.currentTarget.style.setProperty('--scroll-dist', `-${dist}px`);
            const duration = Math.max(1.5, dist / 30);
            e.currentTarget.style.animation = `marquee-bounce ${duration}s linear infinite alternate`;
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.animation = 'none';
        }}
      >
        {text}
      </span>
    </div>
  );
};

export default function App() {
  const [boardState, setBoardState] = useState({ projects: [], trash: [] });
  const [playingId, setPlayingId] = useState(null);
  const [playbackTime, setPlaybackTime] = useState(0);
  const [playbackDuration, setPlaybackDuration] = useState(0);
  const [uploadingProjects, setUploadingProjects] = useState({});
  const [isLoaded, setIsLoaded] = useState(false);
  const [collapsedProjects, setCollapsedProjects] = useState({});
  
  const [loopedTracks, setLoopedTracks] = useState({});
  const [loopedProjects, setLoopedProjects] = useState({});
  const [openDropdown, setOpenDropdown] = useState(null);
  const [showTrash, setShowTrash] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  
  const currentProjectRef = useRef(null);
  const audioRef = useRef(new Audio());
  const fileInputRef = useRef(null);
  const [uploadTargetId, setUploadTargetId] = useState(null);

  useEffect(() => {
    socket.on('initialState', (state) => {
      setBoardState({ projects: state.projects || [], trash: state.trash || [] });
      setIsLoaded(true);
    });
    socket.on('boardUpdated', (state) => setBoardState({ projects: state.projects || [], trash: state.trash || [] }));

    const audio = audioRef.current;
    
    const updateTime = () => {
      setPlaybackTime(audio.currentTime);
      if (audio.duration && audio.duration !== Infinity && !isNaN(audio.duration)) {
        setPlaybackDuration(audio.duration);
      }
    };
    audio.addEventListener('timeupdate', updateTime);

    const handleEnded = () => {
      if (loopedTracks[playingId]) {
        audio.currentTime = 0;
        audio.play().catch(e=>console.log(e));
        return;
      }
      
      if (currentProjectRef.current && loopedProjects[currentProjectRef.current]) {
        setBoardState(prev => {
          const proj = prev.projects.find(p => p.id === currentProjectRef.current);
          if (proj) {
            const idx = proj.tracks.findIndex(t => t.id === playingId);
            if (idx !== -1 && idx + 1 < proj.tracks.length) {
              const nextTrack = proj.tracks[idx + 1];
              setTimeout(() => {
                if (nextTrack.url) {
                  audioRef.current.src = nextTrack.url;
                  audioRef.current.play();
                }
                setPlayingId(nextTrack.id);
              }, 0);
            } else {
              setPlayingId(null);
            }
          } else {
             setPlayingId(null);
          }
          return prev;
        });
      } else {
        setPlayingId(null);
      }
    };
    audio.addEventListener('ended', handleEnded);

    const closeDropdown = () => setOpenDropdown(null);
    document.addEventListener('click', closeDropdown);

    return () => {
      socket.off('initialState');
      socket.off('boardUpdated');
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('ended', handleEnded);
      document.removeEventListener('click', closeDropdown);
    };
  }, [playingId, loopedTracks, loopedProjects]);

  const emitUpdate = (newState) => {
    setBoardState(newState);
    socket.emit('updateBoard', newState);
  };

  const handlePlayPause = (track, projectId, e) => {
    e.stopPropagation();
    if (playingId === track.id) {
      audioRef.current.pause();
      setPlayingId(null);
    } else {
      currentProjectRef.current = projectId;
      if (track.url) {
        audioRef.current.src = track.url;
        audioRef.current.play();
        setPlayingId(track.id);
      } else {
        setPlayingId(track.id);
        setPlaybackDuration(153); // mock 2:33 duration for testing the standard track
        setPlaybackTime(0);
        setTimeout(() => setPlayingId(null), 10000); 
      }
    }
  };



  const onDragStart = () => {
    setOpenDropdown(null);
  };

  const onDragEnd = (result) => {
    const { source, destination, type } = result;
    if (!destination) {
      if (source.droppableId === 'trash' && boardState.projects.length === 0) {
         let sourceList = Array.from(boardState.trash);
         const [movedTrack] = sourceList.splice(source.index, 1);
         
         const newId = `p-${uuidv4()}`;
         const newProject = {
           id: newId,
           title: getNextProjectTitle(),
           tracks: [movedTrack]
         };
         setCollapsedProjects(prev => ({ ...prev, [newId]: false }));
         emitUpdate({ projects: [newProject], trash: sourceList });
      }
      return;
    }
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    if (type === 'PROJECT') {
      const newProjects = reorder(boardState.projects, source.index, destination.index);
      emitUpdate({ ...boardState, projects: newProjects });
      return;
    }

    const getList = (id) => id === 'trash' ? boardState.trash : boardState.projects.find(p => p.id === id)?.tracks;
    if (!getList(source.droppableId) || !getList(destination.droppableId)) return;
    
    let sourceList = Array.from(getList(source.droppableId));
    let destList = source.droppableId === destination.droppableId 
      ? sourceList 
      : Array.from(getList(destination.droppableId));
    
    const [movedTrack] = sourceList.splice(source.index, 1);
    destList.splice(destination.index, 0, movedTrack);

    let newProjects = [...boardState.projects];
    let newTrash = [...boardState.trash];

    if (source.droppableId === 'trash') newTrash = sourceList;
    else {
      const idx = newProjects.findIndex(p => p.id === source.droppableId);
      newProjects[idx] = { ...newProjects[idx], tracks: sourceList };
      
      // Auto-delete project if it's empty after drag out AND title is empty
      if (newProjects[idx].tracks.length === 0 && newProjects[idx].title === "") {
        newProjects.splice(idx, 1);
      }
    }

    if (source.droppableId !== destination.droppableId) {
      if (destination.droppableId === 'trash') newTrash = destList;
      else {
        const idx = newProjects.findIndex(p => p.id === destination.droppableId);
        if (idx !== -1) newProjects[idx] = { ...newProjects[idx], tracks: destList };
      }
    } else {
      if (destination.droppableId === 'trash') newTrash = destList;
      else {
        const idx = newProjects.findIndex(p => p.id === destination.droppableId);
        if (idx !== -1) newProjects[idx] = { ...newProjects[idx], tracks: destList };
      }
    }

    setBoardState(prev => {
      socket.emit('updateBoard', { projects: newProjects, trash: newTrash });
      return { projects: newProjects, trash: newTrash };
    });
  };

  const toggleDropdown = (id, e) => {
    e.stopPropagation();
    setOpenDropdown(openDropdown === id ? null : id);
  };

  const handleTrackAction = (action, track, projectId, e) => {
    e.stopPropagation();
    setOpenDropdown(null);
    if (action === 'loop') {
      setLoopedTracks(prev => ({ ...prev, [track.id]: !prev[track.id] }));
    } else if (action === 'export') {
      if (track.url) saveAs(track.url, track.title + '.mp3');
      else alert('Demo track cannot be exported. Upload a real track.');
    } else if (action === 'delete') {
      let newProjects = [...boardState.projects];
      let newTrash = [...boardState.trash];
      
      const pIdx = newProjects.findIndex(p => p.id === projectId);
      const tIdx = newProjects[pIdx].tracks.findIndex(t => t.id === track.id);
      const [removed] = newProjects[pIdx].tracks.splice(tIdx, 1);
      
      newTrash.push(removed);
      
      if (newProjects[pIdx].tracks.length === 0 && newProjects[pIdx].title === "") {
        newProjects.splice(pIdx, 1);
      }
      
      emitUpdate({ projects: newProjects, trash: newTrash });
      if (playingId === track.id) {
         audioRef.current.pause();
         setPlayingId(null);
      }
    }
  };

  const handleProjectAction = async (action, project, e) => {
    e.stopPropagation();
    setOpenDropdown(null);
    if (action === 'loop') {
      setLoopedProjects(prev => ({ ...prev, [project.id]: !prev[project.id] }));
    } else if (action === 'export') {
      const zip = new JSZip();
      const folder = zip.folder(project.title);
      let count = 0;
      for (const track of project.tracks) {
        if (track.url) {
           try {
             const resp = await fetch(track.url);
             const blob = await resp.blob();
             folder.file(track.title + '.mp3', blob);
             count++;
           } catch(err) { console.error('export err', err); }
        }
      }
      if (count === 0) {
        alert('No uploaded files to export.');
        return;
      }
      zip.generateAsync({type:"blob"}).then((content) => {
        saveAs(content, (project.title || "Project") + ".zip");
      });
    } else if (action === 'delete') {
      let newProjects = [...boardState.projects];
      const idx = newProjects.findIndex(p => p.id === project.id);
      if (idx !== -1) {
        newProjects.splice(idx, 1);
        emitUpdate({ projects: newProjects, trash: boardState.trash });
      }
    }
  };

  const handleTitleChange = (projectId, newTitle) => {
    let newProjects = [...boardState.projects];
    const idx = newProjects.findIndex(p => p.id === projectId);
    
    if (newTitle === "" && newProjects[idx].tracks.length === 0) {
      newProjects.splice(idx, 1); 
    } else {
      newProjects[idx] = { ...newProjects[idx], title: newTitle };
    }
    
    emitUpdate({ projects: newProjects, trash: boardState.trash });
  };

  const enforceUniqueTitle = (projectId) => {
    setBoardState(prev => {
      let newProjects = [...prev.projects];
      const idx = newProjects.findIndex(p => p.id === projectId);
      if (idx === -1) return prev;

      let title = newProjects[idx].title.trim();
      if (!title) return prev;

      const isDuplicate = (t) => newProjects.some((p, i) => i !== idx && p.title.trim() === t);

      let finalTitle = title;
      if (isDuplicate(finalTitle)) {
        let count = 1;
        while (isDuplicate(`${title} ${count}`)) {
          count++;
        }
        finalTitle = `${title} ${count}`;
      }
      
      if (finalTitle !== newProjects[idx].title) {
        newProjects[idx] = { ...newProjects[idx], title: finalTitle };
        socket.emit('updateBoard', { projects: newProjects, trash: prev.trash });
        return { ...prev, projects: newProjects };
      }
      return prev;
    });
  };

  const getNextProjectTitle = () => {
    let count = 0;
    while (true) {
      const candidateTitle = count === 0 ? 'New Project' : `New Project ${count}`;
      if (!boardState.projects.find(p => p.title === candidateTitle)) {
        return candidateTitle;
      }
      count++;
    }
  };

  const handleAddProject = () => {
    const newId = `p-${uuidv4()}`;
    const newProject = {
      id: newId,
      title: getNextProjectTitle(),
      tracks: []
    };
    setCollapsedProjects(prev => ({ ...prev, [newId]: false }));
    emitUpdate({ ...boardState, projects: [...boardState.projects, newProject] });
  };

  const initiateUpload = (projectId) => {
    setUploadTargetId(projectId);
    fileInputRef.current.click();
  };

  const processFiles = async (files, projectId) => {
    if (!files || !files.length || !projectId) return;

    setUploadingProjects(prev => ({ ...prev, [projectId]: true }));
    try {
      const uploadPromises = files.map(async (file) => {
        const formData = new FormData();
        formData.append('file', file);

        const res = await fetch(`${SERVER_URL}/upload`, {
          method: 'POST',
          body: formData
        });

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`Server returned ${res.status}: ${errText}`);
        }

        const data = await res.json();
        
        return new Promise((resolve) => {
          const audioMock = new Audio(data.url);
          audioMock.onloadedmetadata = () => {
            const durationStr = formatTime(audioMock.duration);
            const now = new Date();
            const uploadDateStr = `${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}/${now.getFullYear()}`;
            
            resolve({
              id: `t-${uuidv4()}`,
              title: data.filename.replace(/\.[^/.]+$/, ""), 
              duration: durationStr, 
              url: data.url,
              uploadedAt: uploadDateStr
            });
          };
          audioMock.onerror = () => {
            const now = new Date();
            const uploadDateStr = `${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}/${now.getFullYear()}`;
            resolve({
              id: `t-${uuidv4()}`,
              title: data.filename.replace(/\.[^/.]+$/, ""), 
              duration: "0:00", 
              url: data.url,
              uploadedAt: uploadDateStr
            });
          };
        });
      });

      const newTracks = await Promise.all(uploadPromises);

      setBoardState(prev => {
        let newProjects = [...prev.projects];
        const pIdx = newProjects.findIndex(p => p.id === projectId);
        if (pIdx !== -1) {
          newProjects[pIdx] = { ...newProjects[pIdx], tracks: [...newProjects[pIdx].tracks, ...newTracks] };
          socket.emit('updateBoard', { projects: newProjects, trash: prev.trash });
          return { ...prev, projects: newProjects };
        }
        return prev;
      });
    } catch (err) {
      console.error('Upload failed', err);
      alert(`Upload Failed! Vercel or Render might be misconfigured.\n\nError: ${err.message}`);
    } finally {
      setUploadingProjects(prev => ({ ...prev, [projectId]: false }));
    }
  };

  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files);
    await processFiles(files, uploadTargetId);
    e.target.value = '';
    setUploadTargetId(null);
  };

  const [dragOverlayId, setDragOverlayId] = useState(null);

  const handleNativeDragOver = (e, projectId) => {
    e.preventDefault();
    if (e.dataTransfer.types.includes('Files')) {
      setDragOverlayId(projectId);
    }
  };

  const handleNativeDragLeave = (e) => {
    e.preventDefault();
    setDragOverlayId(null);
  };

  const handleNativeDrop = async (e, projectId) => {
    e.preventDefault();
    setDragOverlayId(null);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const audioFiles = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('audio/'));
      if (audioFiles.length > 0) {
        await processFiles(audioFiles, projectId);
      }
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'baseline', gap: '120px', marginBottom: '80px' }}>
        <div>
          <h1 className="demos-header" style={{ margin: 0 }}>In progress</h1>
          {!isLoaded && (
            <div style={{ fontSize: '10px', color: '#888', fontStyle: 'italic', marginTop: '10px' }}>
              connecting to cloud...
            </div>
          )}
        </div>
        {isLoaded && (
          <button className="add-project-btn" onClick={handleAddProject} style={{ margin: 0 }}>
            + Add Project
          </button>
        )}
      </div>
      
      <input 
        type="file" 
        multiple
        style={{ display: 'none' }} 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        accept="audio/*"
      />

      <DragDropContext onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <Droppable droppableId="board" type="PROJECT" direction="horizontal">
          {(provided) => (
            <div 
              className="board"
              ref={provided.innerRef}
              {...provided.droppableProps}
            >
              {boardState.projects.map((project, index) => (
                <Draggable key={project.id} draggableId={project.id} index={index}>
                  {(provided) => (
                    <div
                      className="project-column"
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      onDragOver={(e) => handleNativeDragOver(e, project.id)}
                      onDragLeave={handleNativeDragLeave}
                      onDrop={(e) => handleNativeDrop(e, project.id)}
                      style={{
                        ...provided.draggableProps.style,
                        backgroundColor: dragOverlayId === project.id ? '#f0f0f0' : 'transparent',
                        transition: 'background-color 0.1s'
                      }}
                    >
                      <div className="project-title" style={{ position: 'relative' }} {...provided.dragHandleProps}>
                        <div style={{ display: 'flex', alignItems: 'center' }} onDoubleClick={() => setCollapsedProjects(prev => ({...prev, [project.id]: prev[project.id] === false ? true : false}))}>
                          {editingProject === project.id ? (
                            <input 
                              autoFocus
                              value={project.title} 
                              onChange={(e) => handleTitleChange(project.id, e.target.value)} 
                              onBlur={() => { enforceUniqueTitle(project.id); setEditingProject(null); }}
                              onKeyDown={(e) => { 
                                if (e.key === 'Enter') {
                                  enforceUniqueTitle(project.id); 
                                  setEditingProject(null);
                                } 
                              }}
                              style={{ width: '100%' }}
                            />
                          ) : (
                            <div style={{ flex: 1, minHeight: '16px', cursor: 'grab' }}>
                              {project.title || "..."}
                              <div style={{ fontSize: '10px', color: '#888', marginTop: '2px' }}>
                                {project.tracks.length} tracks • {formatTime(project.tracks.reduce((acc, tr) => acc + parseTime(tr.duration), 0))}
                              </div>
                              <button 
                                className="add-btn" 
                                style={{ marginTop: '4px', fontSize: '10px', padding: 0 }} 
                                onClick={() => setCollapsedProjects(prev => ({...prev, [project.id]: collapsedProjects[project.id] !== false ? false : true}))}
                              >
                                {collapsedProjects[project.id] !== false ? '+ Expand project' : '- Collapse project'}
                              </button>
                            </div>
                          )}
                          <button className="project-menu-btn" onClick={(e) => toggleDropdown(`menu-p-${project.id}`, e)} style={{ marginLeft: '10px' }}>...</button>
                        </div>
                        {openDropdown === `menu-p-${project.id}` && (
                          <div className="dropdown-menu">
                            <button onClick={(e) => { e.stopPropagation(); setEditingProject(project.id); setOpenDropdown(null); }}>
                              Rename
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); setCollapsedProjects(prev => ({...prev, [project.id]: prev[project.id] === false ? true : false})); setOpenDropdown(null); }}>
                              {collapsedProjects[project.id] !== false ? 'Expand' : 'Collapse'}
                            </button>
                            <button onClick={(e) => handleProjectAction('loop', project, e)}>
                              {loopedProjects[project.id] ? 'Unloop' : 'Loop'}
                            </button>
                            <button onClick={(e) => handleProjectAction('export', project, e)}>Export</button>
                            {project.tracks.length === 0 && (
                              <button onClick={(e) => handleProjectAction('delete', project, e)}>Delete</button>
                            )}
                          </div>
                        )}
                      </div>
                      
                      <Droppable droppableId={project.id} type="TRACK">
                        {(provided) => (
                          <div 
                            className="tracks-list"
                            ref={provided.innerRef}
                            {...provided.droppableProps}
                          >
                            {collapsedProjects[project.id] !== false ? null : project.tracks.map((track, trackIndex) => {
                              const isPlaying = playingId === track.id;
                              
                              let displayTime = track.duration || '1:00';
                              if (isPlaying) {
                                const remaining = Math.max(0, playbackDuration - playbackTime);
                                if (remaining >= 0) displayTime = formatTime(remaining);
                              }
                              
                              return (
                                <Draggable key={track.id} draggableId={track.id} index={trackIndex}>
                                  {(provided) => (
                                    <div
                                      className={`track-item ${isPlaying ? 'playing' : ''}`}
                                      ref={provided.innerRef}
                                      {...provided.draggableProps}
                                      {...provided.dragHandleProps}
                                      style={{ position: 'relative', ...provided.draggableProps.style }}
                                    >
                                      <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                                        <button 
                                          className="track-button" 
                                          onClick={(e) => handlePlayPause(track, project.id, e)}
                                        >
                                          {isPlaying ? '❚❚' : '►'}
                                        </button>
                                        


                                        <ScrollableTitle text={track.title} />
                                        <span className="track-duration" style={{ marginLeft: '10px' }}>{displayTime}</span>
                                        <button className="track-menu-btn" onClick={(e) => toggleDropdown(`menu-t-${track.id}`, e)} style={{ marginLeft: '10px' }}>...</button>
                                      </div>

                                      {openDropdown === `menu-t-${track.id}` && (
                                        <div className="dropdown-menu">
                                          <div style={{ padding: '5px 10px', color: '#888', cursor: 'default', fontSize: '10px' }}>
                                            {track.uploadedAt || "03/31/2026"}
                                          </div>
                                          <button onClick={(e) => handleTrackAction('loop', track, project.id, e)}>
                                            {loopedTracks[track.id] ? 'Unloop' : 'Loop'}
                                          </button>
                                          <button onClick={(e) => handleTrackAction('export', track, project.id, e)}>Export</button>
                                          <button onClick={(e) => handleTrackAction('delete', track, project.id, e)}>Delete</button>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </Draggable>
                              );
                            })}
                            {provided.placeholder}
                          </div>
                        )}
                      </Droppable>
                      
                      {collapsedProjects[project.id] !== false ? null : (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                          <button className="add-btn" onClick={() => initiateUpload(project.id)}>
                            + Add tracks
                          </button>
                        </div>
                      )}
                      
                      {uploadingProjects[project.id] && (
                        <div style={{ marginTop: '8px', fontSize: '10px', color: '#888', fontStyle: 'italic', paddingLeft: '4px' }}>
                          uploading to cloudinary...
                        </div>
                      )}
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
        
        {isLoaded && (
          <div style={{ marginTop: '150px', marginBottom: '100px' }}>
            <button style={{ fontSize: '10px', fontWeight: 'normal' }} onClick={() => setShowTrash(!showTrash)}>
              {showTrash ? 'Hide recently deleted' : 'Recently deleted'}
            </button>
            
            {showTrash && (
              <div style={{ marginTop: '20px', paddingTop: '20px' }}>
                <Droppable droppableId="trash" type="TRACK">
                  {(provided) => (
                    <div 
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      style={{ minHeight: '50px', display: 'flex', flexWrap: 'wrap' }}
                    >
                      {boardState.trash?.length === 0 && <span style={{ color: '#888', fontSize: '10px' }}>No recently deleted tracks</span>}
                      {boardState.trash?.map((track, trackIndex) => (
                      <Draggable key={track.id} draggableId={track.id} index={trackIndex}>
                        {(provided) => (
                           <div
                             ref={provided.innerRef}
                             {...provided.draggableProps}
                             {...provided.dragHandleProps}
                             style={{
                               fontSize: '10px',
                               marginRight: '20px',
                               marginBottom: '10px',
                               ...provided.draggableProps.style
                             }}
                           >
                             <span style={{ textDecoration: 'line-through', color: '#888' }}>{track.title}</span>
                           </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </div>
          )}
        </div>
        )}
      </DragDropContext>
    </div>
  );
}
