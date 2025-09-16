import { useRef } from 'react';
import './styles/CustomSlider.css';

const CustomSlider = ({ value, onChange, min = 0, max = 1, step = 0.01 }) => {
  const sliderRef = useRef(null);
  const isDragging = useRef(false);

  const handleMouseMove = (e) => {
    if (isDragging.current && sliderRef.current) {
      const rect = sliderRef.current.getBoundingClientRect();
      const newValue = Math.min(
        Math.max(((e.clientX - rect.left) / rect.width) * (max - min) + min, min),
        max
      );
      const roundedValue = Math.round(newValue / step) * step;
      onChange(roundedValue); // Pass the new value directly
    }
  };

  const handleMouseDown = () => {
    isDragging.current = true;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleMouseUp = () => {
    isDragging.current = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  };

  const handleClick = (e) => {
    if (sliderRef.current) {
      const rect = sliderRef.current.getBoundingClientRect();
      const newValue = Math.min(
        Math.max(((e.clientX - rect.left) / rect.width) * (max - min) + min, min),
        max
      );
      const roundedValue = Math.round(newValue / step) * step;
      onChange(roundedValue); // Pass the new value directly
    }
  };

  return (
    <div
      className="slider-container"
      ref={sliderRef}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
    >
      <div className="slider-track" style={{ width: `${((value - min) / (max - min)) * 100}%` }} />
    </div>
  );
};

export default CustomSlider;
