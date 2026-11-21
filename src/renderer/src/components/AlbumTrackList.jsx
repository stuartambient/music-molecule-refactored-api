import { useEffect, useRef, useState } from 'react';
import { GiPlayButton } from 'react-icons/gi';
import { HiPlusSm, HiCheck } from 'react-icons/hi';
import { useAudioPlayer } from '../mainAudioContext';
import { requestMusicTracks } from '../utility/musicRequests';
import { trackNumber } from '../utility/albumTrackOrder';
import { selectedTrackIndex } from '../utility/listSelection';

function AlbumTrack({ track, index, tracks, albumPath }) {
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
  const selected =
    state.listSelections?.albumTracksActive?.albumPath === albumPath &&
    selectedTrackIndex(state, 'albumTracksActive', tracks) === index;
  const title = track.title || track.audiotrack;
  const disc = trackNumber(track.disc);
  const number = trackNumber(track.track);
  const count = trackNumber(track.trackCount);

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
    <li
      className={`albumtrack${current ? ' is-current' : ''}${selected ? ' is-selected' : ''}`}
      data-selected={selected || undefined}
    >
      <span className="album-track-number">
        {disc ? `Disc ${disc} · ` : ''}
        {number || index + 1}
        {count ? ` / ${count}` : ''}
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
            albumPath,
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

export default function AlbumTrackList({ tracks, albumPath }) {
  return tracks.map((track, index) => (
    <AlbumTrack
      key={track.track_id}
      track={track}
      index={index}
      tracks={tracks}
      albumPath={albumPath}
    />
  ));
}
