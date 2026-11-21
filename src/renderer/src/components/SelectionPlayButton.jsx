import { useEffect, useRef, useState } from 'react';
import { GiPlayButton } from 'react-icons/gi';
import { useAudioPlayer } from '../mainAudioContext';
import { requestMusicTracks } from '../utility/musicRequests';
import { sortAlbumTracks } from '../utility/albumTrackOrder';

export default function SelectionPlayButton({
  list,
  track,
  index,
  queue,
  albumPath,
  onOpenAlbum,
  title
}) {
  const { state, dispatch } = useAudioPlayer();
  const [loading, setLoading] = useState(false);
  const mounted = useRef(false);
  const latestRequest = useRef(state.playbackRequest);
  latestRequest.current = state.playbackRequest;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const album = list === 'albumTracksActive';
  const selection = state.listSelections?.[list];
  const label = album
    ? selection?.trackId
      ? `Play last selected track from ${title}`
      : `Choose a track from ${title}`
    : `Play ${title} from ${list === 'playlistActive' ? 'Playlist' : 'Tracks'}`;

  const play = async () => {
    if (loading) return;
    if (!album) {
      dispatch({ type: 'select-track', track, index, queue, list, play: true, resume: true });
      return;
    }
    if (!selection?.trackId) {
      onOpenAlbum();
      return;
    }
    let sequence = queue;
    const request = state.playbackRequest;
    const isCurrent = () => mounted.current && latestRequest.current === request;
    setLoading(true);
    try {
      if (!sequence?.some((entry) => entry.track_id === selection.trackId)) {
        sequence = await requestMusicTracks(
          'prepare-music-tracks',
          [{ album: albumPath, inspect: true }],
          dispatch,
          'Resume album track',
          isCurrent,
          true
        );
      }
      if (!isCurrent() || !sequence) return;
      sequence = sortAlbumTracks(sequence);
      const position = sequence.findIndex((entry) => entry.track_id === selection.trackId);
      if (position < 0) {
        dispatch({
          type: 'music-notice',
          notice: {
            title: 'Resume album track',
            message:
              'The previously selected track is no longer in this album. Open the album and choose a track.'
          }
        });
        return;
      }
      dispatch({
        type: 'select-track',
        track: sequence[position],
        index: position,
        queue: sequence,
        list,
        albumPath,
        resume: true,
        play: true
      });
    } finally {
      if (mounted.current) setLoading(false);
    }
  };

  return (
    <button
      className="selection-play"
      type="button"
      onClick={play}
      aria-label={label}
      title={loading ? 'Loading album track…' : label}
      aria-busy={loading}
      disabled={loading}
    >
      <GiPlayButton aria-hidden="true" />
    </button>
  );
}
