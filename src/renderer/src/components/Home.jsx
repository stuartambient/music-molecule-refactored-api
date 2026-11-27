import { useState, useRef } from 'react';
import { useAudioPlayer } from '../mainAudioContext';
import SearchField from './SearchField';
import GaplessToggle from './GaplessToggle';
import { AiFillDownSquare } from 'react-icons/ai';
import { GrDocumentMissing } from 'react-icons/gr';
import { IoIosRefresh } from 'react-icons/io';
import '../style/Home.css';
import AlbumsCoverView from './AlbumsCoverView';

const Home = () => {
  const { state, dispatch } = useAudioPlayer();
  const [homepage /* setHomePage */] = useState('albums-cover-view');
  const [coversSortOrder, setCoversSortOrder] = useState('DESC');
  const [coversSearchField, setCoversSearchField] = useState(state.coversSearchField || 'metadata');
  const [coverSize, setCoverSize] = useState(1);
  /* const getKey = () => uuidv4(); */

  const handleCoverSize = (e) => {
    setCoverSize(Number(e.target.value));
  };

  const handleCoversSort = (e) => {
    e.preventDefault();
    console.log('handleCoversSort: ', e.currentTarget.id);
    if (e.currentTarget.id === 'desc') {
      setCoversSortOrder('DESC');
      dispatch({
        type: 'covers-date-sort',
        coversDateSort: 'DESC',
        covers: [],
        coversPageNumber: 0
      });
    } else if (e.currentTarget.id === 'asc') {
      setCoversSortOrder('ASC');
      dispatch({
        type: 'covers-date-sort',
        coversDateSort: 'ASC',
        covers: [],
        coversPageNumber: 0
      });
    } else return;
  };

  const handleMissingCoversRequest = (e) => {
    e.preventDefault();

    dispatch({
      type: 'covers-missing-request',
      coversMissingReq: 'missing-covers',
      covers: [],
      coversPageNumber: 0
    });
  };

  const handleCoversSearchTerm = (e) => {
    e.preventDefault();
    dispatch({
      type: 'covers-search-term',
      coversSearchTerm: coverSearchRef.current.value,
      coversSearchField,
      covers: [],
      coversPageNumber: 0
    });
  };

  const handleCoversRefresh = (e) => {
    console.log(e.currentTarget.id);
    setCoversSortOrder('DESC');
    coverSearchRef.current.value = '';
    setCoversSearchField('metadata');
    dispatch({
      type: 'covers-refresh',
      coversMissingReq: 'not-requested',
      covers: [],
      coversPageNumber: 0,
      coversSearchTerm: '',
      coversSearchField: 'metadata',
      coversDateSort: 'DESC'
    });
  };

  const coverSearchRef = useRef();
  return (
    <>
      <ul
        className={!state.home ? 'album-cover-tools albums-hidden' : 'album-cover-tools'}
        style={{ color: 'white' }}
      >
        {homepage === 'albums-cover-view' && (
          <>
            <li className="covers-search-container">
              <SearchField
                label={coversSearchField === 'genre' ? 'Search covers by genre' : 'Search covers'}
                placeholder={coversSearchField === 'genre' ? 'e.g. prog rock' : 'Search folders'}
                id="covers-search-term"
                name="covers-search-term"
                inputRef={coverSearchRef}
                onSubmit={handleCoversSearchTerm}
              >
                <select
                  aria-label="Search covers by"
                  value={coversSearchField}
                  onChange={(event) => setCoversSearchField(event.target.value)}
                  title="Genre matches albums with at least one track whose genre contains all search fragments."
                >
                  <option value="metadata">Folder</option>
                  <option value="genre">Genre</option>
                </select>
              </SearchField>
            </li>
            <li className="covers-gapless">
              <GaplessToggle />
            </li>
            <li className="range-slider">
              <input
                type="range"
                id="cover-size"
                name="cover-size"
                min="1"
                max="3"
                step="1"
                list="ticks"
                value={coverSize}
                onChange={handleCoverSize}
              />
              <datalist id="ticks">
                <option value="1"></option>
                <option value="2"></option>
                <option value="3"></option>
              </datalist>
            </li>
            <li>
              {' '}
              <div className="cover-icons" style={{ display: 'flex', flexDirection: 'column' }}>
                <span className="svg-container" id="desc" onClick={handleCoversSort}>
                  <AiFillDownSquare
                    className={coversSortOrder === 'DESC' ? 'sort-icon' : 'sort-icon-static'}
                    style={{ transform: 'rotate(180deg)' }}
                  />
                </span>

                <span className="svg-container" id="asc" onClick={handleCoversSort}>
                  <AiFillDownSquare
                    className={coversSortOrder === 'ASC' ? 'sort-icon' : 'sort-icon-static'}
                  />
                </span>
              </div>
            </li>
            <li>
              <div
                className="cover-icons extra-icons"
                id="missing-covers"
                onClick={handleMissingCoversRequest}
              >
                <GrDocumentMissing />
              </div>
            </li>
            <li>
              <div
                className="cover-icons extra-icons"
                id="refresh-covers"
                onClick={handleCoversRefresh}
              >
                <IoIosRefresh />
              </div>
            </li>
          </>
        )}
      </ul>
      <AlbumsCoverView
        //resetKey={getKey}
        coverSize={coverSize}
        className={!state.home ? 'albums-coverview albums-hidden' : 'albums-coverview'}
      />
    </>
  );
};

export default Home;
