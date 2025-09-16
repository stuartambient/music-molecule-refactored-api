import '../style/Row.css';

// eslint-disable-next-line no-unused-vars, unused-imports/no-unused-vars
const Row = ({ className, index, data, onClick, onChange, isChecked, stat }) => {
  /* console.log('data: ', data); */
  /* const rowData = data[index];  */

  const rowStyles = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-start',
    height: '50px',
    backgroundColor: index % 2 === 0 ? 'var(--tags-row-even)' : 'var(--tags-row-odd)',
    color: index % 2 === 0 ? 'var(--tags-row-even-color)' : 'var(--tags-row-odd-color)'
    // Add more styles as needed
  };

  const itemStyles = {
    marginLeft: '10px',
    fontWeight: 'bold',
    cursor: 'pointer'
    // Add more styles as needed
  };

  const countStyles = {
    marginRight: '10px',
    cursor: 'pointer',
    margin: '0 10px'
    // Add more styles as needed
  };

  return (
    <div style={rowStyles}>
      {stat === 'stat-artists' && (
        <>
          <label className="list-checkbox">
            <input
              type="checkbox"
              id={data.performers}
              data-list="artists"
              checked={isChecked}
              onChange={onChange}
            />
          </label>
          <span id={data.performers} onClick={onClick} style={itemStyles}>
            {data.performers}
          </span>
          <span style={countStyles}>{data.count}</span>
        </>
      )}
      {stat === 'stat-genres' && (
        <>
          <label className="list-checkbox">
            <input
              type="checkbox"
              id={data.genre_display}
              data-list="genres"
              checked={isChecked}
              onChange={onChange}
            />
          </label>
          <span style={itemStyles} id={data.genre_display} onClick={onClick}>
            {!data.genre_display ? 'null' : data.genre_display}
          </span>
          {data.genre_display && (
            <span id={data.genre_display} style={countStyles}>
              {data.count}
            </span>
          )}
        </>
      )}
      {/*       {stat === 'stat-folder' && (
        <>
          {rowData.root && (
            <>
              <span id={rowData.root} onClick={onClick} style={{ cursor: 'pointer' }}>
                {rowData.root}
              </span>
              <span style={{ cursor: 'pointer' }}>
                <GiExpandedRays id={`${rowData.root}--expand`} onClick={onClick} />
              </span>
              <span id={rowData.count}>{rowData.count}</span>
            </>
          )}
        </>
      )} */}
      {stat === 'stat-albums' && (
        <>
          <label className="list-checkbox">
            <input
              type="checkbox"
              id={data.fullpath}
              checked={isChecked}
              onChange={onChange}
              data-list="albums"
            />
          </label>
          <span
            key={data.id}
            className="list-item"
            id={data.fullpath}
            onClick={onClick}
            style={itemStyles}
          >
            {data.foldername}
          </span>
        </>
      )}
    </div>
  );
};

export default Row;
