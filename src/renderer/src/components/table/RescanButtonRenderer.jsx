import { IoMdRefreshCircle } from 'react-icons/io';

const RescanButtonRenderer = (props) => {
  const { data, context } = props;
  console.log('rescanButtonRenderer: ', props);
  /* if (!data?.error) return null; */

  // No error → render nothing
  /*   if (!error) return null; */

  return (
    <button className="rescanButton" onClick={() => console.log('rescan clicked')}>
      <IoMdRefreshCircle />
    </button>
  );
};

export default RescanButtonRenderer;
