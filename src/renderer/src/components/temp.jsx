update tags, # of tags:  [
  {
    id: 'D:/music/Aidan Baker and Tomas Jaermyr - Werl/01-aidan_baker_and_tomas_jarmyr-werl_i-489e5733.mp3',
    track_id: 'b53fc524-8681-4c53-9081-e4181771c336',
    updates: { performers: 'Aidan Baker, Tomas Jarmyr' }
  },
  {
    id: 'D:/music/Aidan Baker and Tomas Jaermyr - Werl/02-aidan_baker_and_tomas_jarmyr-werl_ii-6f0a1d1c.mp3',
    track_id: '4d0915fa-33df-4f87-823c-a59b8a64b227',
    updates: { performers: 'Aidan Baker, Tomas Jarmyr' }
  }
]
write-state first called:  unwritable
db result:  { changes: 1, lastInsertRowid: 0 }
write-state first called:  unwritable
db result:  { changes: 1, lastInsertRowid: 0 }
UA:  [
  {
    id: 'D:/music/Aidan Baker and Tomas Jaermyr - Werl/01-aidan_baker_and_tomas_jarmyr-werl_i-489e5733.mp3',
    track_id: 'b53fc524-8681-4c53-9081-e4181771c336',
    updates: { performers: 'Aidan Baker, Tomas Jarmyr' }
  },
  {
    id: 'D:/music/Aidan Baker and Tomas Jaermyr - Werl/02-aidan_baker_and_tomas_jarmyr-werl_ii-6f0a1d1c.mp3',
    track_id: '4d0915fa-33df-4f87-823c-a59b8a64b227',
    updates: { performers: 'Aidan Baker, Tomas Jarmyr' }
  }
] FA:  [
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
updateTagResults:  {
  failedCount: 2,
  total: 2,
  allFailed: true,
  noneFailed: false,
  mixed: false
}
result1:  {
  status: 'failed',
  updatedArray: [
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
input:  [
  {
    id: 'D:/music/Aidan Baker and Tomas Jaermyr - Werl/01-aidan_baker_and_tomas_jarmyr-werl_i-489e5733.mp3',
    track_id: 'b53fc524-8681-4c53-9081-e4181771c336',
    updates: { performers: 'Aidan Baker, Tomas Jarmyr' }
  },
  {
    id: 'D:/music/Aidan Baker and Tomas Jaermyr - Werl/02-aidan_baker_and_tomas_jarmyr-werl_ii-6f0a1d1c.mp3',
    track_id: '4d0915fa-33df-4f87-823c-a59b8a64b227',
    updates: { performers: 'Aidan Baker, Tomas Jarmyr' }
  }
]
parseMeta:  [
  {
    id: 'D:/music/Aidan Baker and Tomas Jaermyr - Werl/01-aidan_baker_and_tomas_jarmyr-werl_i-489e5733.mp3',
    track_id: 'b53fc524-8681-4c53-9081-e4181771c336',
    updates: { performers: 'Aidan Baker, Tomas Jarmyr' }
  },
  {
    id: 'D:/music/Aidan Baker and Tomas Jaermyr - Werl/02-aidan_baker_and_tomas_jarmyr-werl_ii-6f0a1d1c.mp3',
    track_id: '4d0915fa-33df-4f87-823c-a59b8a64b227',
    updates: { performers: 'Aidan Baker, Tomas Jarmyr' }
  }
]
result2:  [
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
update files:  [
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
] --- [
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
result3:  {
  success: true,
  message: 'Files updated successfully',
  files: [
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
}
list-type:  root-tracks
list-type:  root-tracks
window action:  minimize
