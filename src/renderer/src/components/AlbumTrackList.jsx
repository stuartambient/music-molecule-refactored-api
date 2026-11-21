import { useEffect, useRef, useState } from 'react';
import { GiPlayButton } from 'react-icons/gi';
import { HiPlusSm, HiCheck } from 'react-icons/hi';
import { useAudioPlayer } from '../mainAudioContext';
import { requestMusicTracks } from '../utility/musicRequests';

function AlbumTrack({ track, index, tracks }) {
  const { state, dispatch } = useAudioPlayer();
  const [adding, setAdding] = useState(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const inPlaylist = state.playlistTracks.some((entry) => entry.track_id === track.track_id);
  const current = state.playbackTrack?.track_id === track.track_id;
  const title = track.title || track.audiotrack;

  const addTrack = async () => {
    if (adding || inPlaylist) return;
    setAdding(true);
    try {
      const available = await requestMusicTracks(
        'prepare-music-tracks',
        [{ tracks: [track] }],
        dispatch,
        'Add track to Playlist',
        () => mounted.current
      );
      if (mounted.current && available?.length) {
        dispatch({ type: 'track-to-playlist', playlistTracks: available });
      }
    } finally {
      if (mounted.current) setAdding(false);
    }
  };

  return (
    <li className={`albumtrack${current ? ' is-current' : ''}`}>
      <span className="album-track-number">
        {track.disc ? `Disc ${track.disc} · ` : ''}
        {track.track || index + 1}
        {track.trackCount ? ` / ${track.trackCount}` : ''}
      </span>
      <button
        type="button"
        className="album-track-play"
        title={`Play ${title}`}
        aria-label={`Play ${title}`}
        aria-current={current ? 'true' : undefined}
        onClick={() =>
          dispatch({
            type: 'select-track',
            track,
            index,
            queue: tracks,
            list: 'albumTracksActive',
            play: true
          })
        }
      >
        <GiPlayButton aria-hidden="true" />
        <span className="album-track-title">{title}</span>
      </button>
      <button
        type="button"
        className="album-add-track"
        onClick={addTrack}
        disabled={adding || inPlaylist}
        aria-busy={adding}
        aria-label={inPlaylist ? `${title} is already in playlist` : `Add ${title} to playlist`}
        title={
          inPlaylist
            ? 'Already in playlist'
            : adding
              ? 'Adding to playlist…'
              : 'Add track to playlist'
        }
      >
        {inPlaylist ? <HiCheck aria-hidden="true" /> : <HiPlusSm aria-hidden="true" />}
      </button>
    </li>
  );
}

export default function AlbumTrackList({ tracks }) {
  return tracks.map((track, index) => (
    <AlbumTrack key={track.track_id} track={track} index={index} tracks={tracks} />
  ));
}
