import { useTheme } from '../../ThemeContext';
import './styles/StatusTagLoader.css';
import '../../themes.css';

const StatusTagLoader = ({ config }) => {
  const { theme } = useTheme();
  return <span className={`${config} ${theme}`}></span>;
};

export default StatusTagLoader;
