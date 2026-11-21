import { forwardRef } from 'react';
import ContextMenu from './ContextMenu';
import { useAudioPlayer } from '../mainAudioContext';
import handleTrackSelect from '../utility/audioUtils';
import SelectionPlayButton from './SelectionPlayButton';
/* import { FaCirclePlus as Plus } from 'react-icons/fa6'; */
/* import { FaCircleMinus as Minus } from 'react-icons/fa6'; */
import { HiPlusSm as Plus } from 'react-icons/hi';
import { HiMinusSm as Minus } from 'react-icons/hi';
/* import { Plus, Minus } from '../assets/icons'; */
import '../style/FlashEffect.css';

const TrackDetails = ({ artist, title, album }) => (
  <>
    {[
      ['Artist', artist],
      ['Title', title],
      ['Album', album]
    ].map(([label, value]) => (
      <span className="track-field" key={label} title={`${label}: ${value}`}>
        <span className="track-field-label">{label}:</span>
        <span className="track-field-value">{value}</span>
      </span>
    ))}
  </>
);

const Item = forwardRef((props, ref) => {
  const { state, dispatch } = useAudioPlayer();
  /* const { setContextMenuItem } = useContextMenu(); */

  if (props.type === 'files') {
    /* console.log('val: ', props['data-val']); */
    const newId = props.divId.split('--')[0];
    return (
      <div
        className={`${props.className || 'item'}${props.showSelectionPlay ? ' has-selection-play' : ''}${state.flashDiv?.id === newId ? ' flash-effect' : ''}`}
        data-selected={props.isSelected || undefined}
        id={props.divId}
        ref={ref}
        /* fromlisttype={props.type} */
      >
        {props.showSelectionPlay && (
          <SelectionPlayButton
            list="tracklistActive"
            track={props.track}
            index={Number(props['data-val'])}
            queue={state.tracks}
            title={props.title}
          />
        )}
        <a
          className="track-details"
          href={props.href}
          id={props.id}
          data-val={props['data-val']}
          /* fromlisttype={props.type} */
          onClick={(e) =>
            handleTrackSelect(e, state, dispatch, {
              artist: props.artist,
              title: props.title,
              album: props.album,
              audiofile: props.audiofile,
              like: props.like,
              list: 'tracklistActive'
            })
          }
        >
          <TrackDetails artist={props.artist} title={props.title} album={props.album} />
        </a>
        <div className="item-menu">
          <ContextMenu fromlisttype={props.type} id={props.id} />
          {/* onContextMenu=
          {() => setContextMenuItem({ id: props.id, type: props.type, state, dispatch })} */}
        </div>
      </div>
    );
  }

  if (props.type === 'folder') {
    return (
      <div
        id={props.id}
        className={`${props.className || 'item'}${props.showSelectionPlay ? ' has-selection-play' : ''}${state.flashDiv?.id === props.id ? ' flash-effect' : ''}`}
        aria-current={props.isPlayingAlbum ? 'true' : undefined}
        data-selected={props.isSelected || undefined}
        ref={ref}
        /*  fromlisttype={props.type} */
      >
        {props.showSelectionPlay && (
          <SelectionPlayButton
            list="albumTracksActive"
            albumPath={props.fullpath}
            queue={props.albumQueue}
            onOpenAlbum={props.onOpenAlbum}
            title={props.foldername}
          />
        )}
        <div className="item-albumname">
          <a
            href={props.href}
            id={props.id}
            onClick={(event) => {
              event.preventDefault();
              dispatch({ type: 'select-album', albumPath: props.fullpath });
            }}
          >
            {props.foldername}
          </a>
        </div>
        <div className="item-menu" /* fullpath={props.fullpath} */>
          <ContextMenu fromlisttype={props.type} id={props.id} fullpath={props.fullpath} />
        </div>
        <div
          className="item-albumtrack"
          id={props.id}
          data-term={props.term}
          onClick={(e) => props.handleAlbumTracksRequest(e)}
        >
          {props.showMore === props.id ? <Minus id="minus" /> : <Plus id="plus" />}
        </div>
        {props.albumPattern === props.fullpath && props.albumTracksLength ? (
          <ul className="albumtracks">{props.albumsTracks}</ul>
        ) : null}
      </div>
    );
  }
  if (props.type === 'playlist') {
    return (
      <div
        id={props.divId}
        className={`${props.className || 'item'}${props.showSelectionPlay ? ' has-selection-play' : ''}`}
        data-selected={props.isSelected || undefined}
        ref={ref} /* fromlisttype={props.type} */
      >
        {props.showSelectionPlay && (
          <SelectionPlayButton
            list="playlistActive"
            track={props.track}
            index={Number(props['data-val'])}
            queue={state.playlistTracks}
            title={props.title}
          />
        )}
        <a
          className="track-details"
          href={props.href}
          id={props.id}
          data-val={props['data-val']}
          /* fromlisttype={props.type} */
          onClick={(e) =>
            handleTrackSelect(e, state, dispatch, {
              artist: props.artist,
              title: props.title,
              album: props.album,
              audiofile: props.audiofile,
              like: props.like,
              list: 'playlistActive'
            })
          }
        >
          <TrackDetails artist={props.artist} title={props.title} album={props.album} />
        </a>
        <div className="item-menu">
          <ContextMenu fromlisttype={props.type} id={props.id} divid={props.divId} />
        </div>
      </div>
    );
  }
});
Item.displayName = 'Item';
export default Item;
