import classNames from 'classnames';
import { useAudioPlayer } from '../mainAudioContext';
import { useEffect, useRef, useState } from 'react';
import useIpcEvent from '../hooks/useIpcEvent';
import StatusLoader from './table/StatusLoader';
import { AiOutlineMenu, AiOutlineInfoCircle } from 'react-icons/ai';
import { FaListUl } from 'react-icons/fa';
import { CgMiniPlayer } from 'react-icons/cg';
import { IoMdHelpCircleOutline } from 'react-icons/io';
import { VscChromeMaximize, VscChromeMinimize, VscChromeClose } from 'react-icons/vsc';

import '../style/MainNav.css';
import MetadataUpdateReport from './MetadataUpdateReport';

const MainNav = ({ onClick }) => {
  const { state, dispatch } = useAudioPlayer();
  const [updateOption, setUpdateOption] = useState(null);
  const [updateResults, setUpdateResults] = useState(null);
  const resultTimer = useRef(null);

  useEffect(() => () => clearTimeout(resultTimer.current), []);

  const parseUpdateType = (type, result) => {
    console.log('type: ', type, 'update-results: ', updateResults);
    switch (type) {
      case 'files':
      case 'folders': {
        const summary = result.nochange
          ? `${type} update completed, no changes`
          : `${type} new: ${result.new} del: ${result.deleted}`;
        const skipped = result.skippedRoots?.map(({ root }) => root);
        return skipped?.length
          ? `${summary}. Skipped unreadable roots: ${skipped.join(', ')}`
          : summary;
      }

      case 'folders-error':
        return `Folder update failed. ${result?.result || 'Please check the terminal for details.'}`;

      case 'files-error':
        return `File update failed. ${result?.result || 'Please check the terminal for details.'}`;

      case 'covers-error':
        return `Cover update failed. ${result?.result || 'Please try again.'}`;

      case 'meta-error':
        if (result.report) return <MetadataUpdateReport report={result.report} />;
        return `Metadata update failed. ${result?.result || 'Please try again.'}`;

      case 'metadata':
        if (result.details) return <MetadataUpdateReport report={result} />;
        if (result.failed)
          return `metadata modified: ${result.modified}, failed: ${result.failed}. Run Update Meta to retry failed files.`;
        return result.nochange
          ? `${type} update completed, no changes`
          : `${type} modified: ${result.modified}`;

      case 'covers':
        return result.added === 0
          ? `${type} update completed, no changes`
          : `${type} update completed, added: ${result.added}`;

      default:
        return 'Unknown update type';
    }
  };

  useEffect(() => {
    if (updateResults && updateOption) {
      setUpdateResults(null);
    }
  }, [updateResults, updateOption]);

  useIpcEvent('update-complete', handleUpdate);
  useIpcEvent('update-error', handleUpdate);

  function handleUpdate(type, result) {
    console.log('type:', type, 'result:', result);
    clearTimeout(resultTimer.current);
    setUpdateResults(parseUpdateType(type, result));
    setUpdateOption(null);
    if (type !== 'metadata' && type !== 'meta-error') {
      resultTimer.current = setTimeout(() => setUpdateResults(null), 15000);
    }
  }

  /*   useEffect(() => {
    const handleUpdateError = (type, result) => {
      console.log('type: ', type, 'result: ', result);
      setUpdateResults(parseUpdateType(type, result));
      setUpdateOption(null);
      setTimeout(() => {
        setUpdateResults(null);
      }, 4000);
    };

    window.api.onUpdateError(handleUpdateError);
    return () => {
      window.api.off('update-error', handleUpdateError);
    };
  }, []); */

  /*   useEffect(() => {
    const handleUpdate = (type, result) => {
      console.log('type: ', type, 'result: ', result);
      setUpdateResults(parseUpdateType(type, result));
      setUpdateOption(null);
      setTimeout(() => {
        setUpdateResults(null);
      }, 4000);
    };

    window.api.onUpdateComplete(handleUpdate);
    return () => {
      window.api.off('update-complete', handleUpdate);
    };
  }, []); */

  useEffect(() => {
    const runUpdates = () => {
      switch (updateOption) {
        case 'update-folders': {
          window.ipcApi.updateFolders();
          break;
        }
        case 'update-files': {
          window.ipcApi.updateFiles();
          break;
        }
        case 'update-covers': {
          window.ipcApi.updateCovers();
          break;
        }
        case 'update-meta': {
          window.ipcApi.updateMeta();
          break;
        }
        case 'settings':
        case 'setup / modify':
        case 'schedule-updates':
        case 'theme-preferences': {
          dispatch({
            type: 'set-page',
            home: false,
            update: true,
            player: false,
            library: false,
            tagEditor: false,
            minimalmode: false,
            miniModePlaylist: false
          });
          dispatch({
            type: 'config-options',
            setup:
              updateOption === 'schedule-updates'
                ? 'schedule'
                : updateOption === 'theme-preferences'
                  ? 'preferences'
                  : 'setup'
          });
          setUpdateOption(null);
          return;
        }
        case 'update-all':
          return;
        default:
          return;
      }
    };
    if (updateOption) runUpdates();
  }, [dispatch, updateOption]);

  const handleUpdateOption = (option) => {
    console.log('option: ', option);
    setUpdateOption(option);
  };

  useIpcEvent('hamburger-menu-command', handleUpdateOption);

  const mainNav = classNames(`main-nav ${state.mainTheme}`, {
    'main-nav--minimal': state.minimalmode,
    'main-nav--hidden': state.player && !state.library
  });

  return (
    <nav className={mainNav}>
      {updateResults && !state.minimalmode && (
        <div className="scan-result" role="status" aria-live="polite">
          <div className="scan-result-message">{updateResults}</div>
          <button
            type="button"
            className="scan-result-dismiss"
            aria-label="Dismiss scan result"
            onClick={() => setUpdateResults(null)}
          >
            ×
          </button>
        </div>
      )}
      {!state.minimalmode && (
        <>
          <ul className="main-nav--left" style={{ justifySelf: 'start' }}>
            <li onClick={onClick} id="menu" className="main-nav-menu">
              <AiOutlineMenu />
            </li>
          </ul>
          <ul className="main-nav--center">
            <li
              onClick={onClick}
              id="player"
              className={state.player ? 'main-nav-active' : 'main-nav-inactive'}
            >
              <span>Player</span>
            </li>
            <li
              onClick={onClick}
              id="playerplaylist"
              className={state.player ? 'main-nav-active' : 'main-nav-inactive'}
            >
              <span>Lists</span>
            </li>
            <li onClick={onClick} id="mini-mode" className="endline main-nav-inactive">
              <span>Miniplayer</span>
            </li>
            <li
              onClick={onClick}
              id="albums"
              className={state.home ? 'main-nav-active' : 'main-nav-inactive'}
            >
              <span>Covers</span>
            </li>
            <li
              onClick={onClick}
              id="tag-editor"
              className={state.tagEditor ? 'main-nav-active' : 'main-nav-inactive'}
            >
              <span>Tags</span>
            </li>
            {!updateOption ||
            updateOption === 'settings' ||
            updateOption === 'setup / modify' ||
            updateOption === 'schedule-updates' ||
            updateOption === 'theme-preferences' ? null : (
              <li className="status-loader-container">
                <StatusLoader config="status-loader nav" />
              </li>
            )}
          </ul>
          <ul className="main-nav--right">
            <li onClick={onClick} id="help">
              <IoMdHelpCircleOutline />
            </li>
            <li onClick={onClick} id="minimize">
              <VscChromeMinimize />
            </li>
            <li onClick={onClick} id="maximize">
              <VscChromeMaximize />
            </li>
            <li onClick={onClick} id="close">
              <VscChromeClose />
            </li>
          </ul>
        </>
      )}

      {state.minimalmode && (
        <>
          <ul className="main-nav--left-minimal">
            <li onClick={onClick} id="menu" className="main-nav-menu">
              <AiOutlineMenu />
            </li>
            <li onClick={onClick} id="mini-mode" className="mini-mode on">
              <CgMiniPlayer />
            </li>
            <li
              onClick={onClick}
              id="mini-mode-playlist"
              className={state.miniModePlaylist ? 'playlist-btn on' : 'playlist-btn'}
            >
              <FaListUl />
            </li>
          </ul>
          <ul className="main-nav--center-minimal">
            <li
              className={state.minimalmodeInfo ? 'minimode-info on' : 'minimode-info'}
              id="minimodeinfo"
              onClick={onClick}
              style={{ gridRow: '1 / 2', gridColumn: '5 / 6' }}
            >
              <AiOutlineInfoCircle />
            </li>
          </ul>
          <ul className="main-nav--right-minimal">
            {/*  <li onClick={onClick} id="maximize">
              <AiOutlineFullscreen />
            </li> */}
            {/* <li onClick={onClick} id="close">
              <AiOutlineClose />
            </li> */}
            <li onClick={onClick} id="minimize">
              <VscChromeMinimize />
            </li>
            <li onClick={onClick} id="maximize">
              <VscChromeMaximize />
            </li>
            <li onClick={onClick} id="close">
              <VscChromeClose />
            </li>
          </ul>
        </>
      )}
    </nav>
  );
};

export default MainNav;
