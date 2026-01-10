---------> save-preferences { grids: { tagEdit: { columns: [Array] } } }
new preferences,  { grids: { tagEdit: { columns: [Array] } } }
window action:  minimize
worker path:  C:\Users\sambi\AppData\Local\Music Molecule Data\music.db\music.db
update tags, # of tags:  [
  {
    id: 'D:/music/David Ernst Molnar - Mozart Piano Sonatas and Variations for Piano Duet/3 - Sonata in B-Flat Major, K358_ III. Molto Presto-.flac',
    track_id: 'cde311b8-3ae5-44ac-8c6f-e062a696fc04',
    updates: { error: '', performers: 'David Ernst Molnar' }
  },
  {
    id: 'D:/music/Aidan Baker and Tomas Jaermyr - Werl/01-aidan_baker_and_tomas_jarmyr-werl_i-489e5733.mp3',
    track_id: 'b53fc524-8681-4c53-9081-e4181771c336',
    updates: { error: '' }
  },
  {
    id: 'D:/music/Aidan Baker and Tomas Jaermyr - Werl/02-aidan_baker_and_tomas_jarmyr-werl_ii-6f0a1d1c.mp3',
    track_id: '4d0915fa-33df-4f87-823c-a59b8a64b227',
    updates: { error: null }
  }
]
File D:/music/David Ernst Molnar - Mozart Piano Sonatas and Variations for Piano Duet/3 - Sonata in B-Flat Major, K358_ III. Molto Presto-.flac failed
flac error:  TypeError: Cannot read properties of undefined (reading 'tag')
    at Object.sanitizeFlacPicture (C:\Users\sambi\Documents\nodeProjs\music-molecule-ffmpeg-test\out\main\repairPictures-CyhDgDqH.js:6:25)
    at updateTags (C:\Users\sambi\Documents\nodeProjs\music-molecule-ffmpeg-test\out\main\updateTagsWorker-CYDX1SMZ.js:173:24)
    at async func1 (C:\Users\sambi\Documents\nodeProjs\music-molecule-ffmpeg-test\out\main\updateTagsWorker-CYDX1SMZ.js:297:30)
    at async runSequentially (C:\Users\sambi\Documents\nodeProjs\music-molecule-ffmpeg-test\out\main\updateTagsWorker-CYDX1SMZ.js:334:19)
    at async MessagePort.<anonymous> (C:\Users\sambi\Documents\nodeProjs\music-molecule-ffmpeg-test\out\main\updateTagsWorker-CYDX1SMZ.js:360:25)
errMessage-1:  TypeError: Cannot read properties of undefined (reading 'save')
    at updateTags (C:\Users\sambi\Documents\nodeProjs\music-molecule-ffmpeg-test\out\main\updateTagsWorker-CYDX1SMZ.js:174:16)
    at async func1 (C:\Users\sambi\Documents\nodeProjs\music-molecule-ffmpeg-test\out\main\updateTagsWorker-CYDX1SMZ.js:297:30)
    at async runSequentially (C:\Users\sambi\Documents\nodeProjs\music-molecule-ffmpeg-test\out\main\updateTagsWorker-CYDX1SMZ.js:334:19)
    at async MessagePort.<anonymous> (C:\Users\sambi\Documents\nodeProjs\music-molecule-ffmpeg-test\out\main\updateTagsWorker-CYDX1SMZ.js:360:25)
write-state first called:  unwritable
trackId:  b53fc524-8681-4c53-9081-e4181771c336 error:  file is not writeable
db result:  { changes: 1, lastInsertRowid: 0 }
write-state first called:  unwritable
Error processing file [object Object]: Argument out of range streamLength must be a safe, positive JS integer
trackId:  4d0915fa-33df-4f87-823c-a59b8a64b227 error:  file is not writeable
db result:  { changes: 1, lastInsertRowid: 0 }
result 1:  {
  status: 'partial_success',
  updatedArray: [
    {
      id: 'D:/music/David Ernst Molnar - Mozart Piano Sonatas and Variations for Piano Duet/3 - Sonata in B-Flat Major, K358_ III. Molto Presto-.flac',
      track_id: 'cde311b8-3ae5-44ac-8c6f-e062a696fc04',
      updates: [Object]
    },
    {
      id: 'D:/music/Aidan Baker and Tomas Jaermyr - Werl/01-aidan_baker_and_tomas_jarmyr-werl_i-489e5733.mp3',
      track_id: 'b53fc524-8681-4c53-9081-e4181771c336',
      updates: [Object]
    },
    {
      id: 'D:/music/Aidan Baker and Tomas Jaermyr - Werl/02-aidan_baker_and_tomas_jarmyr-werl_ii-6f0a1d1c.mp3',
      track_id: '4d0915fa-33df-4f87-823c-a59b8a64b227',
      updates: [Object]
    }
  ],
  failedArray: [
    {
      track_id: 'cde311b8-3ae5-44ac-8c6f-e062a696fc04',
      id: 'D:/music/David Ernst Molnar - Mozart Piano Sonatas and Variations for Piano Duet/3 - Sonata in B-Flat Major, K358_ III. Molto Presto-.flac',
      error: "TypeError: Cannot read properties of undefined (reading 'save')\n" +
        '    at updateTags (C:\\Users\\sambi\\Documents\\nodeProjs\\music-molecule-ffmpeg-test\\out\\main\\updateTagsWorker-CYDX1SMZ.js:174:16)\n' +
        '    at async func1 (C:\\Users\\sambi\\Documents\\nodeProjs\\music-molecule-ffmpeg-test\\out\\main\\updateTagsWorker-CYDX1SMZ.js:297:30)\n' +
        '    at async runSequentially (C:\\Users\\sambi\\Documents\\nodeProjs\\music-molecule-ffmpeg-test\\out\\main\\updateTagsWorker-CYDX1SMZ.js:334:19)\n' +
        '    at async MessagePort.<anonymous> (C:\\Users\\sambi\\Documents\\nodeProjs\\music-molecule-ffmpeg-test\\out\\main\\updateTagsWorker-CYDX1SMZ.js:360:25)'
    },
    {
      track_id: 'b53fc524-8681-4c53-9081-e4181771c336',
      id: 'D:/music/Aidan Baker and Tomas Jaermyr - Werl/01-aidan_baker_and_tomas_jarmyr-werl_i-489e5733.mp3',
      error: 'file is not writeable'
    },
    {
      track_id: '4d0915fa-33df-4f87-823c-a59b8a64b227',
      id: 'D:/music/Aidan Baker and Tomas Jaermyr - Werl/02-aidan_baker_and_tomas_jarmyr-werl_ii-6f0a1d1c.mp3',
      error: 'file is not writeable'
    }
  ]
}
func2:  [
  {
    id: 'D:/music/David Ernst Molnar - Mozart Piano Sonatas and Variations for Piano Duet/3 - Sonata in B-Flat Major, K358_ III. Molto Presto-.flac',
    track_id: 'cde311b8-3ae5-44ac-8c6f-e062a696fc04',
    updates: { error: '', performers: 'David Ernst Molnar' }
  },
  {
    id: 'D:/music/Aidan Baker and Tomas Jaermyr - Werl/01-aidan_baker_and_tomas_jarmyr-werl_i-489e5733.mp3',
    track_id: 'b53fc524-8681-4c53-9081-e4181771c336',
    updates: { error: '' }
  },
  {
    id: 'D:/music/Aidan Baker and Tomas Jaermyr - Werl/02-aidan_baker_and_tomas_jarmyr-werl_ii-6f0a1d1c.mp3',
    track_id: '4d0915fa-33df-4f87-823c-a59b8a64b227',
    updates: { error: null }
  }
]
files:  [
  {
    track_id: 'cde311b8-3ae5-44ac-8c6f-e062a696fc04',
    id: 'D:/music/David Ernst Molnar - Mozart Piano Sonatas and Variations for Piano Duet/3 - Sonata in B-Flat Major, K358_ III. Molto Presto-.flac',
    error: "TypeError: Cannot read properties of undefined (reading 'save')\n" +
      '    at updateTags (C:\\Users\\sambi\\Documents\\nodeProjs\\music-molecule-ffmpeg-test\\out\\main\\updateTagsWorker-CYDX1SMZ.js:174:16)\n' +
      '    at async func1 (C:\\Users\\sambi\\Documents\\nodeProjs\\music-molecule-ffmpeg-test\\out\\main\\updateTagsWorker-CYDX1SMZ.js:297:30)\n' +
      '    at async runSequentially (C:\\Users\\sambi\\Documents\\nodeProjs\\music-molecule-ffmpeg-test\\out\\main\\updateTagsWorker-CYDX1SMZ.js:334:19)\n' +
      '    at async MessagePort.<anonymous> (C:\\Users\\sambi\\Documents\\nodeProjs\\music-molecule-ffmpeg-test\\out\\main\\updateTagsWorker-CYDX1SMZ.js:360:25)'
  },
  {
    track_id: 'b53fc524-8681-4c53-9081-e4181771c336',
    id: 'D:/music/Aidan Baker and Tomas Jaermyr - Werl/01-aidan_baker_and_tomas_jarmyr-werl_i-489e5733.mp3',
    error: 'file is not writeable'
  },
  {
    track_id: '4d0915fa-33df-4f87-823c-a59b8a64b227',
    id: 'D:/music/Aidan Baker and Tomas Jaermyr - Werl/02-aidan_baker_and_tomas_jarmyr-werl_ii-6f0a1d1c.mp3',
    error: 'file is not writeable'
  }
]
message:  {
  status: 'partial_status',
  passed: [
    {
      track_id: 'cde311b8-3ae5-44ac-8c6f-e062a696fc04',
      track: 'D:/music/David Ernst Molnar - Mozart Piano Sonatas and Variations for Piano Duet/3 - Sonata in B-Flat Major, K358_ III. Molto Presto-.flac'
    },
    {
      track_id: 'b53fc524-8681-4c53-9081-e4181771c336',
      track: 'D:/music/Aidan Baker and Tomas Jaermyr - Werl/01-aidan_baker_and_tomas_jarmyr-werl_i-489e5733.mp3'
    },
    {
      track_id: '4d0915fa-33df-4f87-823c-a59b8a64b227',
      track: 'D:/music/Aidan Baker and Tomas Jaermyr - Werl/02-aidan_baker_and_tomas_jarmyr-werl_ii-6f0a1d1c.mp3'        
    }
  ],
  failed: [
    {
      track_id: 'cde311b8-3ae5-44ac-8c6f-e062a696fc04',
      id: 'D:/music/David Ernst Molnar - Mozart Piano Sonatas and Variations for Piano Duet/3 - Sonata in B-Flat Major, K358_ III. Molto Presto-.flac',
      error: "TypeError: Cannot read properties of undefined (reading 'save')\n" +
        '    at updateTags (C:\\Users\\sambi\\Documents\\nodeProjs\\music-molecule-ffmpeg-test\\out\\main\\updateTagsWorker-CYDX1SMZ.js:174:16)\n' +
        '    at async func1 (C:\\Users\\sambi\\Documents\\nodeProjs\\music-molecule-ffmpeg-test\\out\\main\\updateTagsWorker-CYDX1SMZ.js:297:30)\n' +
        '    at async runSequentially (C:\\Users\\sambi\\Documents\\nodeProjs\\music-molecule-ffmpeg-test\\out\\main\\updateTagsWorker-CYDX1SMZ.js:334:19)\n' +
        '    at async MessagePort.<anonymous> (C:\\Users\\sambi\\Documents\\nodeProjs\\music-molecule-ffmpeg-test\\out\\main\\updateTagsWorker-CYDX1SMZ.js:360:25)'
    },
    {
      track_id: 'b53fc524-8681-4c53-9081-e4181771c336',
      id: 'D:/music/Aidan Baker and Tomas Jaermyr - Werl/01-aidan_baker_and_tomas_jarmyr-werl_i-489e5733.mp3',
      error: 'file is not writeable'
    },
    {
      track_id: '4d0915fa-33df-4f87-823c-a59b8a64b227',
      id: 'D:/music/Aidan Baker and Tomas Jaermyr - Werl/02-aidan_baker_and_tomas_jarmyr-werl_ii-6f0a1d1c.mp3',
      error: 'file is not writeable'
    }
  ],
  res: {
    success: true,
    message: 'Files updated successfully',
    files: [ [Object], [Object], [Object] ]
  }
}
rows for UI:  [
  {
    track_id: 'cde311b8-3ae5-44ac-8c6f-e062a696fc04',
    root: 'D:/music',
    audiotrack: 'D:/music/David Ernst Molnar - Mozart Piano Sonatas and Variations for Piano Duet/3 - Sonata in B-Flat Major, K358_ III. Molto Presto-.flac',
    modified: 1766872089246.188,
    birthtime: '2023-07-23T21:10:45.267Z',
    error: "TypeError: Cannot read properties of undefined (reading 'save')\n" +
      '    at updateTags (C:\\Users\\sambi\\Documents\\nodeProjs\\music-molecule-ffmpeg-test\\out\\main\\updateTagsWorker-CYDX1SMZ.js:174:16)\n' +
      '    at async func1 (C:\\Users\\sambi\\Documents\\nodeProjs\\music-molecule-ffmpeg-test\\out\\main\\updateTagsWorker-CYDX1SMZ.js:297:30)\n' +
      '    at async runSequentially (C:\\Users\\sambi\\Documents\\nodeProjs\\music-molecule-ffmpeg-test\\out\\main\\updateTagsWorker-CYDX1SMZ.js:334:19)\n' +
      '    at async MessagePort.<anonymous> (C:\\Users\\sambi\\Documents\\nodeProjs\\music-molecule-ffmpeg-test\\out\\main\\updateTagsWorker-CYDX1SMZ.js:360:25)'
  },
  {
    track_id: 'b53fc524-8681-4c53-9081-e4181771c336',
    root: 'D:/music',
    audiotrack: 'D:/music/Aidan Baker and Tomas Jaermyr - Werl/01-aidan_baker_and_tomas_jarmyr-werl_i-489e5733.mp3',     
    modified: 1482355339325.5437,
    birthtime: '2023-07-23T19:24:49.012Z',
    like: 0,
    albumArtists: '',
    album: 'Werl',
    audioBitrate: 320,
    audioSampleRate: 44100,
    beatsPerMinute: 0,
    codecs: 'MPEG Version 1 Audio, Layer 3',
    composers: '',
    conductor: null,
    copyright: null,
    comment: null,
    disc: 0,
    discCount: 0,
    description: null,
    duration: 734798.3673469388,
    encoder: null,
    encodedBy: null,
    encoderSettings: null,
    genres: 'Instrumental',
    isCompilation: 0,
    isrc: null,
    lyrics: null,
    performers: 'Aidan Baker & Tomas Jarmyr',
    performersRole: '',
    pictures: 1,
    publisher: null,
    remixedBy: null,
    replayGainAlbumGain: null,
    replayGainAlbumPeak: null,
    replayGainTrackGain: null,
    replayGainTrackPeak: null,
    tagTypes: 'Id3v1, Id3v2',
    tagWarnings: 1,
    title: 'Werl I',
    track: 1,
    trackCount: 8,
    year: 2016,
    error: 'file is not writeable'
  },
  {
    track_id: '4d0915fa-33df-4f87-823c-a59b8a64b227',
    root: 'D:/music',
    audiotrack: 'D:/music/Aidan Baker and Tomas Jaermyr - Werl/02-aidan_baker_and_tomas_jarmyr-werl_ii-6f0a1d1c.mp3',    
    modified: 1482355339082.381,
    birthtime: '2023-07-23T19:24:49.374Z',
    like: 0,
    albumArtists: '',
    album: 'Werl',
    audioBitrate: 320,
    audioSampleRate: 44100,
    beatsPerMinute: 0,
    codecs: 'MPEG Version 1 Audio, Layer 3',
    composers: '',
    conductor: null,
    copyright: null,
    comment: null,
    disc: 0,
    discCount: 0,
    description: null,
    duration: 527412.2448979592,
    encoder: null,
    encodedBy: null,
    encoderSettings: null,
    genres: 'Instrumental',
    isCompilation: 0,
    isrc: null,
    lyrics: null,
    performers: 'Aidan Baker & Tomas Jarmyr',
    performersRole: '',
    pictures: 1,
    publisher: null,
    remixedBy: null,
    replayGainAlbumGain: null,
    replayGainAlbumPeak: null,
    replayGainTrackGain: null,
    replayGainTrackPeak: null,
    tagTypes: 'Id3v1, Id3v2',
    tagWarnings: 1,
    title: 'Werl II',
    track: 2,
    trackCount: 8,
    year: 2016,
    error: 'file is not writeable'
  }
]
result 3:  {
  success: true,
  message: 'Files updated successfully',
  files: [
    {
      track_id: 'cde311b8-3ae5-44ac-8c6f-e062a696fc04',
      root: 'D:/music',
      audiotrack: 'D:/music/David Ernst Molnar - Mozart Piano Sonatas and Variations for Piano Duet/3 - Sonata in B-Flat 
Major, K358_ III. Molto Presto-.flac',
      modified: 1766872089246.188,
      birthtime: '2023-07-23T21:10:45.267Z',
      error: 'Error: Argument out of range streamLength must be a safe, positive JS integer'
    },
    {
      track_id: 'b53fc524-8681-4c53-9081-e4181771c336',
      root: 'D:/music',
      audiotrack: 'D:/music/Aidan Baker and Tomas Jaermyr - Werl/01-aidan_baker_and_tomas_jarmyr-werl_i-489e5733.mp3',   
      modified: 1482355339325.5437,
      birthtime: '2023-07-23T19:24:49.012Z',
      like: 0,
      albumArtists: '',
      album: 'Werl',
      audioBitrate: 320,
      audioSampleRate: 44100,
      beatsPerMinute: 0,
      codecs: 'MPEG Version 1 Audio, Layer 3',
      composers: '',
      conductor: null,
      copyright: null,
      comment: null,
      disc: 0,
      discCount: 0,
      description: null,
      duration: 734798.3673469388,
      encoder: null,
      encodedBy: null,
      encoderSettings: null,
      genres: 'Instrumental',
      isCompilation: 0,
      isrc: null,
      lyrics: null,
      performers: 'Aidan Baker & Tomas Jarmyr',
      performersRole: '',
      pictures: 1,
      publisher: null,
      remixedBy: null,
      replayGainAlbumGain: null,
      replayGainAlbumPeak: null,
      replayGainTrackGain: null,
      replayGainTrackPeak: null,
      tagTypes: 'Id3v1, Id3v2',
      tagWarnings: 1,
      title: 'Werl I',
      track: 1,
      trackCount: 8,
      year: 2016
    },
    {
      track_id: '4d0915fa-33df-4f87-823c-a59b8a64b227',
      root: 'D:/music',
      audiotrack: 'D:/music/Aidan Baker and Tomas Jaermyr - Werl/02-aidan_baker_and_tomas_jarmyr-werl_ii-6f0a1d1c.mp3',  
      modified: 1482355339082.381,
      birthtime: '2023-07-23T19:24:49.374Z',
      like: 0,
      albumArtists: '',
      album: 'Werl',
      audioBitrate: 320,
      audioSampleRate: 44100,
      beatsPerMinute: 0,
      codecs: 'MPEG Version 1 Audio, Layer 3',
      composers: '',
      conductor: null,
      copyright: null,
      comment: null,
      disc: 0,
      discCount: 0,
      description: null,
      duration: 527412.2448979592,
      encoder: null,
      encodedBy: null,
      encoderSettings: null,
      genres: 'Instrumental',
      isCompilation: 0,
      isrc: null,
      lyrics: null,
      performers: 'Aidan Baker & Tomas Jarmyr',
      performersRole: '',
      pictures: 1,
      publisher: null,
      remixedBy: null,
      replayGainAlbumGain: null,
      replayGainAlbumPeak: null,
      replayGainTrackGain: null,
      replayGainTrackPeak: null,
      tagTypes: 'Id3v1, Id3v2',
      tagWarnings: 1,
      title: 'Werl II',
      track: 2,
      trackCount: 8,
      year: 2016
    }
  ]
}
