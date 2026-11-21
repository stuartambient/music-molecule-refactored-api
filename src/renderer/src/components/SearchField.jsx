import { GiMagnifyingGlass } from 'react-icons/gi';
import '../style/SearchField.css';

export default function SearchField({
  label,
  placeholder,
  onSubmit,
  inputRef,
  id,
  name = 'textsearch'
}) {
  return (
    <form className="search-field" role="search" aria-label={label} onSubmit={onSubmit}>
      <input
        type="search"
        ref={inputRef}
        id={id}
        name={name}
        aria-label={label}
        placeholder={placeholder}
        autoComplete="off"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.currentTarget.value = '';
            event.currentTarget.blur();
          }
        }}
        onContextMenu={() => window.ipcApi.showTextInputMenu()}
      />
      <button type="submit" aria-label="Run search" title={label}>
        <GiMagnifyingGlass aria-hidden="true" />
      </button>
    </form>
  );
}
