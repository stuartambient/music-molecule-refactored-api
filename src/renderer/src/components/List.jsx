import { useRef, useEffect, useState, useMemo } from 'react';
import { Virtuoso } from 'react-virtuoso';
import { useAudioPlayer } from '../mainAudioContext';
import Row from './Row';
/* import { MdDeselect } from 'react-icons/md'; */
import { FaAsterisk } from 'react-icons/fa';
import '../style/List.css';

const Header = ({
  'data-role': dataRole,
  amountLoaded,
  dimensions,
  filterValue,
  setFilterValue,
  onClick,
  stat,
  handleDeselect,
  multiSelects
}) => {
  const { state /*  dispatch */ } = useAudioPlayer();
  const inputRef = useRef(null);
  const childRef = useRef(null);
  const type = stat.split('-')[1];
  const listType = type.charAt(0).toUpperCase() + type.slice(1);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, [filterValue]);

  useEffect(() => {
    if (childRef.current) {
      const parentElement = childRef.current.parentElement;
      if (parentElement) {
        parentElement.classList.add('highlighted');
      }
    }
  }, []);

  if (!dimensions || !dimensions.width) {
    return null;
  }

  const handleFilter = (e) => {
    setFilterValue(e.target.value);
  };

  return (
    <>
      <div
        className={state.mainTheme}
        ref={childRef}
        data-role={dataRole}
        style={{
          position: 'fixed',
          display: 'flex',
          alignItems: 'center',
          background: 'var(--tags-list-header-background)',
          width: `${dimensions.width - 10}px`,
          height: '3rem',
          zIndex: '1'
        }}
      >
        <div
          className="header-content"
          style={{
            display: 'flex',
            justifyContent: 'space-around',
            width: '100%',
            alignItems: 'center'
          }}
        >
          <span>
            {listType} loaded: {amountLoaded}
          </span>
          {/* {stat === 'stat-albums' && ( */}
          <>
            <span className="list-header-button" onClick={onClick}>
              Load selected
            </span>
            <span
              className={
                multiSelects.length > 0 ? 'list-header-deselect alert' : 'list-header-deselect'
              }
              onClick={handleDeselect}
            >
              <FaAsterisk />
            </span>
          </>
          {/*  )} */}
          <span className="search">
            <input
              value={filterValue}
              onChange={handleFilter}
              ref={inputRef}
              placeholder="search"
              style={{
                /* width: '100%', */
                maxWidth: '200px',
                height: '2rem',
                padding: '0.5rem',
                fontSize: '1rem',
                border: '1px solid #ccc',
                borderRadius: '0.25rem',
                outline: 'none',
                transition: 'border-color 0.3s ease',
                marginRight: '3rem'
              }}
            />
          </span>
        </div>
      </div>
    </>
  );
};

const List = ({
  height,
  data,
  width,
  className,
  onClick,
  stat,
  amountLoaded,
  dimensions,
  tableStatus,
  initTable
}) => {
  const { state /* dispatch */ } = useAudioPlayer();
  const [filterValue, setFilterValue] = useState('');
  //const [filteredData, setFilteredData] = useState(data);
  const [multiSelects, setMultiSelects] = useState([]);

  const loadMultiSelections = (e) => {
    const selectId = e.target.id;

    setMultiSelects((prevSelects) =>
      prevSelects.includes(selectId)
        ? prevSelects.filter((select) => select !== selectId)
        : [...prevSelects, selectId]
    );
  };

  const handleDeselect = (e) => {
    e.preventDefault();
    setMultiSelects([]);
  };

  const handleMultiSelects = () => {
    // Determine table name based on `stat` type
    const getTableName = (stat) => {
      switch (stat) {
        case 'stat-genres':
          return 'genre-tracks';
        case 'stat-albums':
          return 'album-tracks';
        case 'stat-artists':
          return 'artist-tracks';
        default:
          return null;
      }
    };

    const tableName = getTableName(stat);

    const loadMultiSelects = async () => {
      // Initialize table if needed
      const tableStat = await tableStatus();
      if (!tableStat && tableName) {
        await initTable(tableName);
      }

      // Fetch tracks by selected type
      /*  const trackFetchers = {
        'album-tracks': () => window.api.getTracksByAlbum(tableName, multiSelects),
        'artist-tracks': () => window.api.getTracksByArtist(tableName, multiSelects),
        'genre-tracks': () => window.api.getTracksByGenre(tableName, multiSelects)
      }; */

      // Only call the specific fetcher for the current `tableName`
      /*       if (tableName && trackFetchers[tableName]) {
        await trackFetchers[tableName]();
      }
    }; */

      if (tableName && multiSelects.length > 1) {
        await window.api.getTracksByCategory(tableName, multiSelects);
      }
    };

    // Trigger loading if more than one album is selected
    if (multiSelects.length > 1) {
      loadMultiSelects();
    }
  };

  const fields = useMemo(
    () => ({
      'stat-albums': 'foldername',
      'stat-genres': 'genre_display',
      'stat-artists': 'performers'
    }),
    []
  );

  const filteredData = useMemo(() => {
    //if (stat !== 'stat-albums') return data;

    if (!filterValue.trim()) return data;

    const lowercasedFilter = filterValue.toLowerCase().trim();
    return data.filter((item) => {
      const field = fields[stat];
      return item[field]?.toLowerCase().includes(lowercasedFilter);
    });
  }, [filterValue, data, fields, stat]);

  /* const filterData = useCallback(() => {
    if (!filterValue.trim()) {
      setFilteredData(data);
    } else {
      const lowercasedFilter = filterValue.toLowerCase().trim();
      console.log('lowercasedFilter: ', lowercasedFilter);
      const filtered = data.filter((item) => {
        const field = fields[stat];
        if (!item[field]) return;
        return item[field].toLowerCase().includes(lowercasedFilter);
      });
      setFilteredData(filtered);
      console.log('filtered: ', filtered);
    }
  }, [filterValue, data, fields, stat]);

  useEffect(() => {
    if (stat !== 'stat-albums') {
      setFilteredData(data);
    }
  }, [stat, data]);

  useEffect(() => {
    if (filterValue) {
      filterData();
    } else if (!filterValue) {
      setFilteredData(data);
    }
  }, [data, filterData, filterValue]); */

  const isChecked = (item) => {
    switch (stat) {
      case 'stat-albums': {
        return multiSelects.includes(item.fullpath);
      }
      case 'stat-genres': {
        return multiSelects.includes(item.genre_display);
      }
      case 'stat-artists': {
        return multiSelects.includes(item.performers);
      }
    }
  };

  const role = 'virtuoso-header';

  return (
    <Virtuoso
      style={{ height, width }}
      className={className}
      data={filteredData}
      components={{
        Header: () => (
          <Header
            amountLoaded={amountLoaded}
            data-role={role}
            dimensions={dimensions}
            filterValue={filterValue}
            setFilterValue={setFilterValue}
            onClick={handleMultiSelects}
            handleDeselect={handleDeselect}
            multiSelects={multiSelects}
            stat={stat}
          />
        )
      }}
      itemContent={(index, item) => {
        /*     console.log('item.id: ', item); */
        return (
          <Row
            className={state.mainTheme}
            index={index}
            data={item} // Pass the item directly
            onClick={onClick}
            onChange={loadMultiSelections}
            isChecked={isChecked(item)}
            stat={stat}
          />
        );
      }}
    />
  );
};

export default List;
