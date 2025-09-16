import { useState, useEffect /* , useRef, Suspense */ } from 'react';
import AGGrid from '../../table/AGGrid';
import './style.css';

const MetadataEditingApp = () => {
  // eslint-disable-next-line unused-imports/no-unused-vars
  const [listType, setListType] = useState([]);
  const [reset, setReset] = useState(false);
  /* const [data, setData] = useState([]); */

  useEffect(() => {
    const handleClearTable = () => {
      setReset(true);
      /* setData([]); */
    };

    window.metadataEditingApi.onClearTable(handleClearTable);

    return () => {
      window.metadataEditingApi.off('clear-table', handleClearTable);
    };
  }, []);

  /*   useEffect(() => {
    const handleSendToChild = (e) => {
      setListType(e.listType);
      setData(e.results);
      setReset(false);
    };

    window.metadataEditingApi.onSendToChild(handleSendToChild);

    return () => {
      window.metadataEditingApi.off('send-to-child', handleSendToChild);
    };
  }, []); */

  return <AGGrid reset={reset} setListType={setListType} setReset={setReset} /* data={data} */ />;
};

export default MetadataEditingApp;
