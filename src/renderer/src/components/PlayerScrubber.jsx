import { useState, useRef, useEffect } from 'react';
import { useAudioPlayer } from '../mainAudioContext';
import { convertDurationSeconds, convertCurrentTime, convertToSeconds } from '../hooks/useTime';

const PlayerScrubber = ({ cTime, setCTime }) => {
  const { state /* dispatch */ } = useAudioPlayer();
  /*   const [cTime, setCTime] = useState('00:00'); */
  const [progbarInc, setProgbarInc] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const seekbarOutline = useRef();
  const seekbar = useRef();

  /*   useEffect(() => {
    const outlineWidth = seekbarOutline.current.clientWidth;

    const convertForProgbar = convertToSeconds(state.duration, cTime);
    setProgbarInc(convertForProgbar * outlineWidth);
  }, [state.duration, cTime]); */

  useEffect(() => {
    const outlineWidth = seekbarOutline.current.clientWidth;

    if (outlineWidth && state.duration && cTime) {
      const progressRatio = convertToSeconds(state.duration, cTime);

      // Ensure progressRatio is clamped between 0 and 1 to prevent overflow
      const clampedProgressRatio = Math.min(Math.max(progressRatio, 0), 1);

      setProgbarInc(clampedProgressRatio * outlineWidth);
    }
  }, [state.duration, cTime]);

  useEffect(() => {
    state.audioRef.current.ontimeupdate = () => {
      if (!isDragging) {
        setCTime(convertCurrentTime(state.audioRef.current));
      }
    };
  }, [state.audioRef, isDragging, setCTime]);

  const handleMouseDown = () => {
    setIsDragging(true);
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;

    const outlineRect = seekbarOutline.current.getBoundingClientRect();
    const outlineWidth = outlineRect.width;
    const clickPosition = e.clientX - outlineRect.left;

    // Clamp clickPosition to prevent out-of-bound calculations
    const clampedClickPosition = Math.min(Math.max(clickPosition, 0), outlineWidth);

    const totalDurationInSeconds = convertDurationSeconds(state.duration);
    const newCurrentTimeInSeconds = (clampedClickPosition / outlineWidth) * totalDurationInSeconds;

    state.audioRef.current.currentTime = newCurrentTimeInSeconds;

    setProgbarInc(clampedClickPosition);
    setCTime(convertCurrentTime(state.audioRef.current));
  };

  const handleMouseUp = (e) => {
    if (isDragging) {
      handleSeekTime(e);
    }
    setIsDragging(false);
  };

  /*   useEffect(() => {
    updateSliderWidth(state.volume);
  }, []); */

  const handleSeekTime = (e) => {
    const totaltime = convertDurationSeconds(state.duration);
    const seekbarOutlineWidth = seekbarOutline.current.clientWidth;
    const seekPoint = e.clientX - seekbarOutline.current.getBoundingClientRect().left;

    state.audioRef.current.currentTime = (totaltime / seekbarOutlineWidth) * seekPoint;
  };

  return (
    <div
      className="seekbar-outline"
      /* id="waveform" */
      id="waveform"
      ref={seekbarOutline}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <div
        className="seekbar"
        ref={seekbar}
        //style={{ width: progbarInc ? `${progbarInc}px` : null }}
        style={{ width: `${progbarInc}px` }}
      ></div>
    </div>
  );
};

export default PlayerScrubber;
