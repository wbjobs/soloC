using UnityEngine;
using System.Collections.Generic;

public class ReplayPlayerSystem : MonoBehaviour
{
    public static ReplayPlayerSystem Instance { get; private set; }

    private GameReplayData _currentReplay;
    private int _currentSnapshotIndex;
    private bool _isPlaying;
    private bool _isPaused;
    private float _playbackSpeed = 1.0f;
    private float _timeSinceLastSnapshot;
    
    public float AutoPlayInterval = 3.0f;

    public delegate void OnSnapshotChangedDelegate(GameSnapshot snapshot);
    public event OnSnapshotChangedDelegate OnSnapshotChanged;

    public delegate void OnReplayStartedDelegate(GameReplayData replay);
    public event OnReplayStartedDelegate OnReplayStarted;

    public delegate void OnReplayEndedDelegate();
    public event OnReplayEndedDelegate OnReplayEnded;

    public delegate void OnPlaybackStateChangedDelegate(bool isPlaying, bool isPaused);
    public event OnPlaybackStateChangedDelegate OnPlaybackStateChanged;

    private void Awake()
    {
        if (Instance == null)
        {
            Instance = this;
            DontDestroyOnLoad(gameObject);
        }
        else
        {
            Destroy(gameObject);
        }
    }

    public void PlayReplay(GameReplayData replayData)
    {
        if (replayData == null || replayData.Snapshots == null || replayData.Snapshots.Count == 0)
        {
            Debug.LogError("Invalid replay data");
            return;
        }

        _currentReplay = replayData;
        _currentSnapshotIndex = 0;
        _isPlaying = true;
        _isPaused = false;
        _timeSinceLastSnapshot = 0;

        OnReplayStarted?.Invoke(replayData);
        ShowCurrentSnapshot();
        OnPlaybackStateChanged?.Invoke(_isPlaying, _isPaused);
    }

    public void StopReplay()
    {
        _currentReplay = null;
        _currentSnapshotIndex = 0;
        _isPlaying = false;
        _isPaused = false;
        _timeSinceLastSnapshot = 0;

        OnReplayEnded?.Invoke();
        OnPlaybackStateChanged?.Invoke(_isPlaying, _isPaused);
    }

    public void PauseReplay()
    {
        if (_isPlaying)
        {
            _isPaused = true;
            OnPlaybackStateChanged?.Invoke(_isPlaying, _isPaused);
        }
    }

    public void ResumeReplay()
    {
        if (_isPlaying && _isPaused)
        {
            _isPaused = false;
            OnPlaybackStateChanged?.Invoke(_isPlaying, _isPaused);
        }
    }

    public void TogglePause()
    {
        if (_isPlaying)
        {
            if (_isPaused)
            {
                ResumeReplay();
            }
            else
            {
                PauseReplay();
            }
        }
    }

    public void NextSnapshot()
    {
        if (_currentReplay == null) return;

        _currentSnapshotIndex = Mathf.Min(_currentSnapshotIndex + 1, _currentReplay.Snapshots.Count - 1);
        ShowCurrentSnapshot();
    }

    public void PreviousSnapshot()
    {
        if (_currentReplay == null) return;

        _currentSnapshotIndex = Mathf.Max(_currentSnapshotIndex - 1, 0);
        ShowCurrentSnapshot();
    }

    public void GoToSnapshot(int index)
    {
        if (_currentReplay == null) return;

        _currentSnapshotIndex = Mathf.Clamp(index, 0, _currentReplay.Snapshots.Count - 1);
        ShowCurrentSnapshot();
    }

    public void GoToFirstSnapshot()
    {
        GoToSnapshot(0);
    }

    public void GoToLastSnapshot()
    {
        if (_currentReplay == null) return;
        GoToSnapshot(_currentReplay.Snapshots.Count - 1);
    }

    public void SetPlaybackSpeed(float speed)
    {
        _playbackSpeed = Mathf.Max(0.25f, Mathf.Min(4.0f, speed));
    }

    private void ShowCurrentSnapshot()
    {
        if (_currentReplay == null || _currentSnapshotIndex >= _currentReplay.Snapshots.Count) return;

        GameSnapshot currentSnapshot = _currentReplay.Snapshots[_currentSnapshotIndex];
        OnSnapshotChanged?.Invoke(currentSnapshot);

        if (UIManager.Instance != null)
        {
            UIManager.Instance.UpdateReplayUI(currentSnapshot, _currentReplay);
        }
    }

    private void Update()
    {
        if (!_isPlaying || _isPaused || _currentReplay == null) return;

        _timeSinceLastSnapshot += Time.deltaTime * _playbackSpeed;

        if (_timeSinceLastSnapshot >= AutoPlayInterval)
        {
            _timeSinceLastSnapshot = 0;

            if (_currentSnapshotIndex < _currentReplay.Snapshots.Count - 1)
            {
                NextSnapshot();
            }
            else
            {
                _isPlaying = false;
                OnReplayEnded?.Invoke();
                OnPlaybackStateChanged?.Invoke(_isPlaying, _isPaused);
            }
        }
    }

    public GameReplayData GetCurrentReplay()
    {
        return _currentReplay;
    }

    public int GetCurrentSnapshotIndex()
    {
        return _currentSnapshotIndex;
    }

    public int GetTotalSnapshots()
    {
        return _currentReplay != null ? _currentReplay.Snapshots.Count : 0;
    }

    public bool IsPlaying()
    {
        return _isPlaying;
    }

    public bool IsPaused()
    {
        return _isPaused;
    }

    public float GetPlaybackSpeed()
    {
        return _playbackSpeed;
    }

    public List<PlayerActionLog> GetLogsForCurrentSnapshot()
    {
        if (_currentReplay == null || _currentReplay.ActionLogs == null)
        {
            return new List<PlayerActionLog>();
        }

        GameSnapshot currentSnapshot = _currentReplay.Snapshots[_currentSnapshotIndex];
        return _currentReplay.ActionLogs.FindAll(log => log.TurnNumber <= currentSnapshot.TurnNumber);
    }

    public PlayerActionLog GetLatestLog()
    {
        var logs = GetLogsForCurrentSnapshot();
        return logs.Count > 0 ? logs[logs.Count - 1] : default;
    }
}
