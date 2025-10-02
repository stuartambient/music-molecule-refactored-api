import { useState /* , useRef, Suspense */ } from 'react';
import AGGrid from '../../table/AGGrid';
import useIpcEvent from '../../../hooks/useIpcEvent';
import './style.css';

const MetadataEditingApp = () => {
  // eslint-disable-next-line unused-imports/no-unused-vars
  const [listType, setListType] = useState([]);
  const [reset, setReset] = useState(false);
  /* const [data, setData] = useState([]); */

  const handleClearTable = () => {
    setReset(true);
    /* setData([]); */
  };

  useIpcEvent('clear-table', handleClearTable, 'tagEditApi');

  return <AGGrid reset={reset} setListType={setListType} setReset={setReset} /* data={data} */ />;
};

export default MetadataEditingApp;
