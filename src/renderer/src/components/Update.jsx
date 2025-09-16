import { useState, useEffect } from 'react';
import { useAudioPlayer } from '../mainAudioContext';

import ScheduleForm from './ScheduleForm';
import NativeDragDropFolderInput from './NativeDragDropFolderInput';
import MainPreferences from './MainPreferences';
/* import { GiTreeRoots } from 'react-icons/gi'; */
import '../style/Update.css';

const Update = () => {
  const { state, dispatch } = useAudioPlayer();
  /*  const [rootsUpdateReq, setRootsUpdateReq] = useState(false);
  const [scheduleUpdates, setScheduleUpdates] = useState(false); */
  const [rootDirs, setRootDirs] = useState([]);

  useEffect(() => {
    const reqRoots = async () => {
      const rootFolders = await window.api.getRoots();
      //console.log('rootFolders: ', rootFolders);
      setRootDirs(rootFolders);
    };
    if (state.setup) {
      reqRoots();
    }
  }, [state.setup]);

  /* const handleUpdates = async (e) => {
    e.preventDefault();
    switch (e.currentTarget.id) {
      case 'rootsupdate':
        setRootsUpdateReq((prevState) => !prevState);
        break;
      case 'schedule-updates':
        setScheduleUpdates((prevState) => !prevState);
        break;
      default:
        return;
    }
  }; */

  return (
    <>
      {state.setup === 'setup' && (
        <div className={`update-container ${state.mainTheme}`}>
          {/* <div className="update-roots" id="rootsupdate" onClick={handleUpdates}>
            <GiTreeRoots /> Add root folders
          </div> */}
          {rootDirs && <NativeDragDropFolderInput rootDirs={rootDirs} setRootDirs={setRootDirs} />}
        </div>
      )}
      {state.setup === 'schedule' && (
        <div className={`update-container ${state.mainTheme}`}>
          {/* <div className="update-roots" id="schedule-updates" onClick={handleUpdates}>
            <GiTreeRoots /> Schedule Updates
          </div> */}
          <ScheduleForm />
        </div>
      )}
      {state.setup === 'preferences' && (
        <div className={`update-container ${state.mainTheme}`}>
          <MainPreferences />
        </div>
      )}
    </>
  );
};

export default Update;
