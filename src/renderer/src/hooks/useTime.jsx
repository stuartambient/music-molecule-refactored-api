export const convertDuration = (refcurrent) => {
  if (!refcurrent?.duration || isNaN(refcurrent.duration)) {
    return '00:00'; // Handle invalid duration gracefully
  }

  const totalSeconds = Math.floor(refcurrent.duration);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const paddedHours = hours > 0 ? hours.toString().padStart(2, '0') + ':' : ''; // Only show hours if > 0
  const paddedMinutes = minutes.toString().padStart(2, '0');
  const paddedSeconds = seconds.toString().padStart(2, '0');

  return `${paddedHours}${paddedMinutes}:${paddedSeconds}`;
};

export const convertCurrentTime = (refcurrent) => {
  if (!refcurrent?.currentTime || isNaN(refcurrent.currentTime)) {
    return '00:00'; // Handle invalid currentTime gracefully
  }

  const totalSeconds = Math.floor(refcurrent.currentTime);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const paddedHours = hours > 0 ? hours.toString().padStart(2, '0') + ':' : ''; // Only show hours if > 0
  const paddedMinutes = minutes.toString().padStart(2, '0');
  const paddedSeconds = seconds.toString().padStart(2, '0');

  return `${paddedHours}${paddedMinutes}:${paddedSeconds}`;
};

export const convertToSeconds = (duration, currentTime) => {
  const parseTime = (time) => {
    const parts = time.split(':').map(Number);

    if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2]; // HH:MM:SS
    } else if (parts.length === 2) {
      return parts[0] * 60 + parts[1]; // MM:SS
    } else {
      console.warn('Invalid time format:', time);
      return 0;
    }
  };

  const totalDurationInSeconds = parseTime(duration);
  const currentTimeInSeconds = parseTime(currentTime);

  if (totalDurationInSeconds === 0) {
    console.warn('Duration is zero, cannot calculate progress.');
    return 0; // Avoid division by zero
  }

  return currentTimeInSeconds / totalDurationInSeconds;
};

export const convertDurationSeconds = (duration) => {
  const splitDuration = duration.split(':').map(Number); // Convert each part to a number

  if (splitDuration.length === 3) {
    // HH:MM:SS format
    return splitDuration[0] * 3600 + splitDuration[1] * 60 + splitDuration[2];
  } else if (splitDuration.length === 2) {
    // MM:SS format
    return splitDuration[0] * 60 + splitDuration[1];
  } else {
    // Invalid format, return 0 as a fallback
    console.warn('Invalid duration format:', duration);
    return 0;
  }
};
