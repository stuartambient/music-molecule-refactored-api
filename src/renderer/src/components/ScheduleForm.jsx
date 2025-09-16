import { useState, useEffect } from 'react';
import { MdArrowBack } from 'react-icons/md';
import '../style/ScheduleForm.css';

const ScheduleForm = () => {
  const [runEveryDay, setRunEveryDay] = useState(false);
  const [everyDayTime, setEveryDayTime] = useState('');
  const [currentSchedule, setCurrentSchedule] = useState(null);
  const [scheduleLoaded, setScheduleLoaded] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [schedulingResults, setSchedulingResults] = useState(false);
  const [schedule, setSchedule] = useState({
    Monday: '',
    Tuesday: '',
    Wednesday: '',
    Thursday: '',
    Friday: '',
    Saturday: '',
    Sunday: ''
  });

  useEffect(() => {
    const loadPreferences = async () => {
      const preferences = await window.api.getPreferences();
      setCurrentSchedule(preferences.schedule || null);
      setScheduleLoaded(true);
    };
    loadPreferences();
  }, []);

  useEffect(() => {
    if (scheduleLoaded && currentSchedule) {
      if (typeof currentSchedule === 'string' && currentSchedule.startsWith('everyday@')) {
        // Set "Run Every Day" mode and extract time
        setRunEveryDay(true);
        setEveryDayTime(currentSchedule.split('@')[1]);
      } else if (typeof currentSchedule === 'object') {
        // Set custom schedule per day
        setRunEveryDay(false);
        setSchedule(currentSchedule);
      }
    }
  }, [currentSchedule, scheduleLoaded]);

  const handleScheduleReload = () => {
    setSchedulingResults(false);
  };

  const handleToggleEveryDay = () => {
    setRunEveryDay(!runEveryDay);
    if (!runEveryDay) {
      setSchedule({
        Monday: '',
        Tuesday: '',
        Wednesday: '',
        Thursday: '',
        Friday: '',
        Saturday: '',
        Sunday: ''
      });
    } else {
      setEveryDayTime('');
    }
  };

  const handleTimeChange = (day, time) => {
    setSchedule((prevSchedule) => ({
      ...prevSchedule,
      [day]: time
    }));
  };

  const saveSchedule = async (type, newSchedule) => {
    console.log('new schedule: ', newSchedule);
    const dataToSave = type === 'every-day' ? `everyday@${newSchedule}` : newSchedule;
    const scheduleResults = await window.api.savePreferences({ schedule: dataToSave });
    if (scheduleResults) {
      setIsSubmitting(false);
      setScheduleLoaded(false);
      setSchedulingResults(true);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    console.log('handleSubmit: ', e);
    if (runEveryDay) {
      saveSchedule('every-day', everyDayTime);
    } else {
      console.log('schedule: ', schedule);
      saveSchedule('custom', schedule);
    }
  };

  return (
    <div className="roots-form">
      {schedulingResults && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexDirection: 'column'
          }}
        >
          <h3>Schedule Updated</h3>
          <p className="back-icon" onClick={handleScheduleReload}>
            <MdArrowBack />
          </p>
        </div>
      )}
      {!schedulingResults && (
        <form onSubmit={handleSubmit}>
          <h3 style={{ textAlign: 'center' }}>Schedule Operations</h3>

          <div style={{ marginBottom: '15px' }}>
            <label>
              <input type="checkbox" checked={runEveryDay} onChange={handleToggleEveryDay} />
              <span style={{ marginLeft: '8px' }}>Run Every Day</span>
            </label>
          </div>

          {runEveryDay ? (
            <div style={{ marginBottom: '15px' }}>
              <label>
                Time:
                <input
                  type="time"
                  value={everyDayTime}
                  onChange={(e) => setEveryDayTime(e.target.value)}
                  style={{
                    marginLeft: '10px',
                    padding: '5px',
                    borderRadius: '4px',
                    border: '1px solid #ccc'
                  }}
                  required
                />
              </label>
            </div>
          ) : (
            <div>
              {Object.keys(schedule).map((day) => (
                <div key={day} style={{ marginBottom: '10px' }}>
                  <label>
                    <input
                      type="time"
                      value={schedule[day]}
                      onChange={(e) => handleTimeChange(day, e.target.value)}
                      style={{
                        marginRight: '10px',
                        padding: '5px',
                        borderRadius: '4px',
                        border: '1px solid #ccc'
                      }}
                    />
                    {day}
                  </label>
                </div>
              ))}
            </div>
          )}

          <button
            type="submit"
            style={{
              display: 'block',
              width: '100%',
              padding: '10px',
              marginTop: '15px',
              backgroundColor: '#007BFF',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Save Schedule
          </button>
        </form>
      )}
    </div>
  );
};

export default ScheduleForm;
