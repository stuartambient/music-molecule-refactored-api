import { useRef } from 'react';
/* import useIpcEvent from '../hooks/useIpcEvent'; */
import { BsThreeDots } from 'react-icons/bs';
import '../style/FlashEffect.css';

const ContextMenu = ({ fromlisttype, id, fullpath = undefined }) => {
  const divRef = useRef(null);

  const handleContextMenu = async (e) => {
    e.preventDefault();
    const id = divRef.current.id;
    const type = divRef.current.dataset.type;
    const path = divRef.current.dataset.path;
    window.ipcApi.send('show-context-menu', id, type, path);
  };

  return (
    <div
      id={id}
      data-type={fromlisttype}
      data-path={fullpath}
      onClick={handleContextMenu}
      style={{ display: 'flex', alignItems: 'center' }}
      ref={divRef}
    >
      <BsThreeDots />
    </div>
  );
};

export default ContextMenu;
