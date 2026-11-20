import { useState, useEffect } from 'react';
import '../style/ScheduleForm.css';

const emptySchedule = () => ({
  Monday: '',
  Tuesday: '',
  Wednesday: '',
  Thursday: '',
  Friday: '',
  Saturday: '',
  Sunday: ''
});

const ScheduleForm = () => {
  const [runEveryDay, setRunEveryDay] = useState(false);
  const [everyDayTime, setEveryDayTime] = useState('');
  const [schedule, setSchedule] = useState(emptySchedule);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setLoadError('');
    window.ipcApi
      .getPreferences()
      .then((preferences) => {
        if (!preferences || typeof preferences !== 'object') throw new Error('Invalid preferences');
        if (!current) return;
        const value = preferences.schedule;
        if (typeof value === 'string' && value.startsWith('everyday@')) {
          setRunEveryDay(true);
          setEveryDayTime(value.slice(9));
        } else {
          setRunEveryDay(false);
          const next = emptySchedule();
          for (const day of Object.keys(next)) next[day] = value?.[day] || '';
          setSchedule(next);
        }
      })
      .catch(() => {
        if (current)
          setLoadError('Could not load the saved schedule. Try again before changing it.');
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [reload]);

  const edited = () => {
    setSaved(false);
    setError('');
  };
  const clearAll = () => {
    setRunEveryDay(false);
    setEveryDayTime('');
    setSchedule(emptySchedule());
    edited();
  };
  const handleSubmit = async (event) => {
    event.preventDefault();
    if (loading || loadError || saving) return;
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const value = runEveryDay ? `everyday@${everyDayTime}` : schedule;
      if (!(await window.ipcApi.savePreferences({ schedule: value })))
        throw new Error('Save failed');
      setSaved(true);
    } catch {
      setError('Could not save the schedule. Your edits are still here; please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className="schedule-form"
      onSubmit={handleSubmit}
      aria-label="Update schedule"
      aria-busy={loading || saving}
    >
      {loading && <p role="status">Loading schedule…</p>}
      {loadError && (
        <div className="settings-error" role="alert">
          <p>{loadError}</p>
          <button type="button" onClick={() => setReload((value) => value + 1)}>
            Retry loading schedule
          </button>
        </div>
      )}
      <fieldset disabled={loading || saving || !!loadError}>
        <legend>Automatic updates</legend>
        <label className="schedule-everyday">
          <input
            type="checkbox"
            checked={runEveryDay}
            onChange={(event) => {
              setRunEveryDay(event.target.checked);
              edited();
            }}
          />
          Run every day
        </label>
        {runEveryDay ? (
          <label className="schedule-time">
            Time
            <input
              type="time"
              required
              value={everyDayTime}
              onChange={(event) => {
                setEveryDayTime(event.target.value);
                edited();
              }}
            />
          </label>
        ) : (
          <div className="schedule-days">
            {Object.keys(schedule).map((day) => (
              <label key={day} className="schedule-time">
                {day}
                <input
                  type="time"
                  value={schedule[day]}
                  onChange={(event) => {
                    setSchedule((current) => ({ ...current, [day]: event.target.value }));
                    edited();
                  }}
                />
              </label>
            ))}
          </div>
        )}
        <p className="settings-help">
          Leave a day blank to skip it. Clear all times and save to turn automatic updates off.
        </p>
        <div className="settings-actions">
          <button type="button" className="settings-secondary" onClick={clearAll}>
            Clear all
          </button>
          <button type="submit">{saving ? 'Saving…' : 'Save schedule'}</button>
        </div>
      </fieldset>
      {saved && (
        <p className="settings-result" role="status">
          Schedule saved.
        </p>
      )}
      {error && (
        <p className="settings-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
};

export default ScheduleForm;
