import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from '../ThemeContext';
import '../themes.css';
import '../style/Modal.css';

const Modal = ({
  fields,
  closeModal,
  isModalOpen,
  onChange,
  hiddenColumns /* , onBulkToggle */
}) => {
  const { theme } = useTheme();
  //if (!isModalOpen) return null;

  // lock background scroll
  useEffect(() => {
    if (isModalOpen) return;
    document.body.classList.add('no-scroll');
    return () => document.body.classList.remove('no-scroll');
  }, [isModalOpen]);

  if (!isModalOpen) return null;

  /* const isChecked = (name) => !hiddenColumns.includes(name); */

  const toggleAll = (nextChecked) => {
    fields.forEach((f) =>
      onChange({ target: { name: f.name, checked: nextChecked, type: 'checkbox' } })
    );
  };

  const content = (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className={`modal-content ${theme}`}>
        <button className="close" onClick={closeModal} aria-label="Close">
          &times;
        </button>

        <h2 id="modal-title" className="modal-title">
          Display Columns
        </h2>

        <div className="modal-actions">
          <button onClick={() => toggleAll(true)} className="btn primary">
            Select all
          </button>
          <button onClick={() => toggleAll(false)} className="btn">
            Select none
          </button>
        </div>

        <fieldset className="options">
          {fields.map((field) => (
            <label key={field.name} className="option">
              <input
                type="checkbox"
                name={field.name}
                /* checked={isChecked(field.name)} */
                checked={!hiddenColumns.includes(field.name)}
                onChange={(e) =>
                  onChange({
                    target: { name: field.name, checked: e.target.checked, type: 'checkbox' }
                  })
                }
              />
              <span>{field.label}</span>
            </label>
          ))}
        </fieldset>

        <div className="modal-footer">
          <button className="btn primary" onClick={closeModal}>
            Done
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
};

export default Modal;
