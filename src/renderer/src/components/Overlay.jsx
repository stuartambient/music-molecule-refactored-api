import { BsThreeDots } from 'react-icons/bs';
import { GiPlayButton } from 'react-icons/gi';
import { FaStop } from 'react-icons/fa';

const Overlay = ({ coverTextSize, id, album, fullpath, currentAlbum }) => {
  return (
    <div className={currentAlbum !== id ? 'overlay' : 'overlay active-album'}>
      <span className={coverTextSize} id={id}>
        {album}
      </span>
      <div className="item-menu" id={id} /* data-fullpath={fullpath} album={album} */>
        <BsThreeDots className="context-menu" id={fullpath} fullpath={fullpath} album={album} />
      </div>
      <span
        className="play-stop-button"
        id={id}
        /* fullpath={fullpath}  */ style={{ alignSelf: 'end' }}
      >
        {currentAlbum === id ? <FaStop /> : <GiPlayButton />}
      </span>
    </div>
  );
};

export default Overlay;
