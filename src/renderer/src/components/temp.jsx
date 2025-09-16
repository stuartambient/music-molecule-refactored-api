const Parent = () => {
  const [filterValue, setFilterValue] = useState('');
  const [filteredData, setFilteredData] = useState(data);
};

const filterData = useCallback(() => {
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
}, [data, filterData, filterValue]);

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
        stat={stat}
      />
    )
  }}
/>;
