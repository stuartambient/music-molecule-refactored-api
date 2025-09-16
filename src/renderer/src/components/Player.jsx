import { useState, useEffect } from 'react';
import { useAudioPlayer } from '../mainAudioContext';
import classNames from 'classnames';
import { TbWorldSearch } from 'react-icons/tb';
import PlayerScrubber from './PlayerScrubber';
import PlayerVolume from './PlayerVolume';
import '../style/Player.css';

const Player = ({ children }) => {
  const { state, dispatch } = useAudioPlayer();
  const [cTime, setCTime] = useState('00:00');
  //const [mainTheme, setMainTheme] = useState('');

  useEffect(() => {
    if (state.minimalmodeInfo && !state.minimalmode) {
      dispatch({
        type: 'mini-mode-info',
        minimalmodeInfo: false
      });
    }
  }, [state.minimalmodeInfo, state.minimalmode, dispatch]);

  useEffect(() => {
    if (state.duration === '') {
      setCTime('00:00');
    }
  }, [state.duration]);

  const getPlayerClassNames = () => {
    return classNames(`audio-player ${state.mainTheme}`, {
      'audio-player--homepage': state.home,
      'minimal-player': state.minimalmode && !state.library,
      'minimal-player--expanded': state.library && state.minimalmode,
      centered: !state.library && !state.minimalmode && !state.home
    });
  };

  return (
    <div
      className={getPlayerClassNames()}
      style={
        state.minimalmode || state.miniModePlaylist
          ? { backgroundImage: `url(${state.cover})` }
          : { backgroundImage: 'none' }
      }
    >
      {/*       {!state.minimalmode && !state.home && (
        <div className="title">
          <p className={state.title.length > 35 ? 'title-transform' : 'title-text'}>
            {state.title}
          </p>
        </div>
      )} */}
      {!state.minimalmode && (
        <div className="title">
          <span className="real-time">
            <span className={state.title.length > 20 ? 'title-transform' : 'title-text'}>
              {state.title}
            </span>
          </span>
        </div>
      )}
      {state.minimalmodeInfo && (
        <div className="minimodeinfo title">
          <span className="real-time">
            <span className={state.title.length > 20 ? 'title-transform' : 'title-text'}>
              {state.title}
            </span>
          </span>
        </div>
      )}
      {state.cover && state.cover !== 'not available' && !state.minimalmode && (
        <>
          <div style={{ backgroundImage: `url` }} className="image">
            {!state.minimalmode && <img src={state.cover} alt="" />}
          </div>
        </>
      )}
      {state.cover === 'not available' && !state.home && state.delay === true && (
        <p style={{ gridRow: '2 / 3' }}>
          No available image - <TbWorldSearch />
        </p>
      )}
      {!state.minimalmode && (
        <>
          {!state.home ? (
            <div className="metadata">
              {state.artist && (
                <div className="metadata-artist">
                  <span className="label">Artist: </span>
                  <span className="real-time">
                    <span className={state.artist.length > 20 ? 'artist-transform' : 'artist-text'}>
                      {state.artist}
                    </span>
                  </span>
                </div>
              )}
              {state.album && (
                <div className="metadata-album">
                  <span className="label">Album: </span>
                  <span className="real-time">
                    <span className={state.album.length > 25 ? 'album-transform' : 'album-text'}>
                      {state.album}
                    </span>
                  </span>
                </div>
              )}
            </div>
          ) : (
            <>
              {state.artist && (
                <div className="metadata-artist ">
                  <span className="real-time">
                    <span className={state.artist.length > 25 ? 'artist-transform' : 'artist-text'}>
                      {state.artist}
                    </span>
                  </span>
                </div>
              )}
              {state.album && (
                <div className="metadata-album">
                  <span className="real-time">
                    <span className={state.album.length > 25 ? 'album-transform' : 'album-text'}>
                      {state.album}
                    </span>
                  </span>
                </div>
              )}
            </>
          )}
        </>
      )}

      {state.minimalmodeInfo && (
        <>
          <div className="minimodeinfo metadata-artist">
            <span className="real-time">
              <span className={state.artist.length > 25 ? 'artist-transform' : 'artist-text'}>
                {state.artist}
              </span>
            </span>
          </div>
          <div className="minimodeinfo metadata-album">
            <span className="real-time">
              <span className={state.album.length > 25 ? 'album-transform' : 'album-text'}>
                {state.album}
              </span>
            </span>
          </div>
        </>
      )}

      {!state.minimalmode && (
        <div className="time">
          <div className="duration">
            {!state.home && !state.minimalmodeInfo && <span className="label">Duration: </span>}
            <span className="real-time">{state.duration}</span>
          </div>
          <div className="elapsed">
            {!state.home && !state.minimalmodeInfo && <span className="label">Elapsed: </span>}
            <span className="real-time">{cTime}</span>
          </div>
        </div>
      )}
      {state.minimalmodeInfo && (
        <div className="minimodeinfo time">
          <div className="duration">
            <span className="real-time">
              <span className="label">Duration: </span>
              {state.duration}
            </span>
          </div>
          <div className="elapsed">
            <span className="real-time">
              <span className="label">Elapsed: </span>
              {cTime}
            </span>
          </div>
        </div>
      )}
      {!state.minimalmode && (
        <>
          <PlayerVolume />
          <PlayerScrubber cTime={cTime} setCTime={setCTime} />
        </>
      )}
      {state.minimalmodeInfo && (
        <>
          {/* <span className="volume-label">Volume</span> */}
          <PlayerVolume />
          {/* <span className="seek-label">Scrub</span> */}
          <PlayerScrubber cTime={cTime} setCTime={setCTime} />
        </>
      )}
      {children}
    </div>
  );
};

export default Player;
