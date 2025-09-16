import { useState } from 'react';
import '../style/MainPreferences.css';

const MainPreferences = () => {
  const [selectedTheme, setSelectedTheme] = useState('');

  const handlePreferences = async (theme) => {
    return await window.api.savePreferences({ mainTheme: theme });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (selectedTheme) {
      // You can call a savePreferences or similar function here
      handlePreferences(selectedTheme);
    } else {
      alert('Please select a theme.');
    }
  };

  return (
    <form className="roots-form" onSubmit={handleSubmit}>
      <h2>Select a Theme</h2>
      <div className="radio-group">
        {['basic', 'theme-1', 'theme-2', 'theme-3', 'theme-4', 'theme-5'].map((theme, index) => (
          <label key={index} className="radio-option">
            <input
              type="radio"
              name="theme"
              value={theme}
              checked={selectedTheme === theme}
              onChange={(e) => setSelectedTheme(e.target.value)}
            />
            {theme}
          </label>
        ))}
      </div>
      <button type="submit" className="submit-button">
        Apply Theme
      </button>
    </form>
  );
};

export default MainPreferences;
