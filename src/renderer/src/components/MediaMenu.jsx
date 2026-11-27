import { useAudioPlayer } from '../mainAudioContext';
import SearchField from './SearchField';
import GaplessToggle from './GaplessToggle';
import { AiFillDownSquare } from 'react-icons/ai';
import { LuScrollText } from 'react-icons/lu';
import '../style/MediaMenu.css';

const MediaMenu = ({
  /* isFilesSortSelected, */
  /*  isAlbumsSortSelected, */
  handleSortClick,
  handleTextSearch,
  tracksSearchField = 'metadata',
  onTracksSearchFieldChange,
  handlePlaylistFiles,
  filesSortType,
  albumsSortType
}) => {
  const { state, dispatch } = useAudioPlayer();
  const handleListType = (type) => {
    /*     if (type !== 'albums') {
      dispatch({
        type: 'reset-queue'
      });
    } */
    dispatch({
      type: 'set-list-type',
      listType: type
      /*   newtrack: '',
      nextTrack: '',
      prevTrack: '',
      pause: true */
    });
  };

  const handleScrollOption = () => {
    console.log('scroller');
    dispatch({
      type: 'list-scroll-option'
    });
  };

  return (
    <ul
      data-playlist={state.listType === 'playlist' || undefined}
      className={
        state.miniModePlaylist
          ? `media-menu media-menu--minimal ${state.mainTheme}`
          : `media-menu ${state.mainTheme}`
      }
    >
      {!state.miniModePlaylist && state.listType === 'files' && (
        <>
          <div
            className={state.listScroll ? 'list-scroll' : 'list-scroll disabled'}
            onClick={handleScrollOption}
          >
            <LuScrollText
              onClick={(e) => {
                e.stopPropagation(); // Prevent the event from bubbling to the <li>
                handleScrollOption(); // If you want it to handle clicks specifically on the icon
              }}
            />
          </div>
          <div className="sort-menu">
            <div className="cover-icons" style={{ display: 'flex', flexDirection: 'column' }}>
              <span className="svg-container" id="DESC" onClick={handleSortClick}>
                <AiFillDownSquare
                  className={filesSortType === 'DESC' ? 'sort-icon' : 'sort-icon-static'}
                  style={{ transform: 'rotate(180deg)' }}
                />
              </span>

              <span className="svg-container" id="ASC" onClick={handleSortClick}>
                <AiFillDownSquare
                  className={filesSortType === 'ASC' ? 'sort-icon' : 'sort-icon-static'}
                />
              </span>
            </div>
          </div>
        </>
      )}
      {!state.miniModePlaylist && state.listType === 'albums' && (
        <div className="sort-menu">
          <div className="cover-icons" style={{ display: 'flex', flexDirection: 'column' }}>
            <span className="svg-container" id="DESC" onClick={handleSortClick}>
              <AiFillDownSquare
                className={albumsSortType === 'DESC' ? 'sort-icon' : 'sort-icon-static'}
                style={{ transform: 'rotate(180deg)' }}
              />
            </span>

            <span className="svg-container" id="ASC" onClick={handleSortClick}>
              <AiFillDownSquare
                className={albumsSortType === 'ASC' ? 'sort-icon' : 'sort-icon-static'}
              />
            </span>
          </div>
        </div>
      )}
      {/*   <div className="right-side"> */}
      {!state.tracksShuffle && state.listType === 'files' && (
        <li className="form">
          <SearchField
            label={tracksSearchField === 'genre' ? 'Search genres' : 'Search tracks'}
            placeholder={tracksSearchField === 'genre' ? 'e.g. prog rock' : 'Search tracks'}
            id="textsearch"
            onSubmit={handleTextSearch}
          >
            <select
              aria-label="Search tracks by"
              value={tracksSearchField}
              onChange={(event) => onTracksSearchFieldChange(event.target.value)}
              title="Genre searches only the genre tag. Partial words can appear in any order."
            >
              <option value="metadata">Tracks</option>
              <option value="genre">Genre</option>
            </select>
          </SearchField>
        </li>
      )}
      {state.listType === 'albums' && (
        <li className="form">
          <SearchField
            label="Search albums"
            placeholder="Search albums"
            id="textsearch"
            onSubmit={handleTextSearch}
          />
        </li>
      )}
      {state.listType === 'playlist' && (
        <>
          <div
            className={state.listScroll ? 'list-scroll-playlist' : 'list-scroll-playlist disabled'}
            onClick={handleScrollOption}
          >
            <LuScrollText
              onClick={(e) => {
                e.stopPropagation(); // Prevent the event from bubbling to the <li>
                handleScrollOption(); // If you want it to handle clicks specifically on the icon
              }}
            />
          </div>
          <li className="playlist-dialogs">
            <GaplessToggle />
            <span className="playlist-actions" role="group" aria-label="Playlist files">
              <button
                type="button"
                id="playlist-clear"
                onClick={handlePlaylistFiles}
                title="Clear playlist"
              >
                Clear
              </button>
              <button
                type="button"
                id="playlist-open"
                onClick={handlePlaylistFiles}
                title="Open playlist"
              >
                Open
              </button>
              <button
                type="button"
                id="playlist-save"
                onClick={handlePlaylistFiles}
                title="Save playlist"
              >
                Save
              </button>
            </span>
          </li>
        </>
      )}
      <li className="tabs">
        <div
          className={state.listType === 'files' ? 'tab active' : 'tab'}
          onClick={() => handleListType('files')}
        >
          <span>tracks</span>
        </div>
        <div
          className={state.listType === 'albums' ? 'tab active' : 'tab'}
          onClick={() => handleListType('albums')}
        >
          <span>albums</span>
        </div>
        <div
          className={state.listType === 'playlist' ? 'tab active' : 'tab'}
          onClick={() => handleListType('playlist')}
        >
          <span>playlist</span>
        </div>
      </li>
      {/* </div> */}
    </ul>
  );
};

export default MediaMenu;
