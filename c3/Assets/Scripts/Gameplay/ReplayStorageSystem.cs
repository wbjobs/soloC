using UnityEngine;
using System.Collections.Generic;
using System.IO;
using System;

public class ReplayStorageSystem : MonoBehaviour
{
    public static ReplayStorageSystem Instance { get; private set; }

    private string _replayDirectory;

    private void Awake()
    {
        if (Instance == null)
        {
            Instance = this;
            DontDestroyOnLoad(gameObject);
            InitializeDirectory();
        }
        else
        {
            Destroy(gameObject);
        }
    }

    private void InitializeDirectory()
    {
        _replayDirectory = Path.Combine(Application.persistentDataPath, "Replays");
        
        if (!Directory.Exists(_replayDirectory))
        {
            Directory.CreateDirectory(_replayDirectory);
            Debug.Log($"Created replay directory: {_replayDirectory}");
        }
    }

    public bool SaveReplay(GameReplayData replayData)
    {
        try
        {
            string timestamp = DateTime.Now.ToString("yyyyMMdd_HHmmss");
            string fileName = $"replay_{timestamp}_{replayData.TotalTurns}turns.json";
            string filePath = Path.Combine(_replayDirectory, fileName);
            
            string json = JsonUtility.ToJson(replayData, true);
            File.WriteAllText(filePath, json);
            
            Debug.Log($"Replay saved to: {filePath}");
            return true;
        }
        catch (Exception e)
        {
            Debug.LogError($"Failed to save replay: {e.Message}");
            return false;
        }
    }

    public GameReplayData LoadReplay(string filePath)
    {
        try
        {
            if (!File.Exists(filePath))
            {
                Debug.LogError($"Replay file not found: {filePath}");
                return null;
            }
            
            string json = File.ReadAllText(filePath);
            GameReplayData replayData = JsonUtility.FromJson<GameReplayData>(json);
            
            Debug.Log($"Loaded replay: {filePath}");
            return replayData;
        }
        catch (Exception e)
        {
            Debug.LogError($"Failed to load replay: {e.Message}");
            return null;
        }
    }

    public List<string> GetAllReplayFiles()
    {
        if (!Directory.Exists(_replayDirectory))
        {
            return new List<string>();
        }
        
        string[] files = Directory.GetFiles(_replayDirectory, "replay_*.json");
        Array.Sort(files);
        
        List<string> replayFiles = new List<string>(files);
        return replayFiles;
    }

    public List<ReplayFileInfo> GetAllReplaysInfo()
    {
        List<ReplayFileInfo> replayInfos = new List<ReplayFileInfo>();
        List<string> files = GetAllReplayFiles();
        
        foreach (string file in files)
        {
            try
            {
                GameReplayData replay = LoadReplay(file);
                if (replay != null)
                {
                    replayInfos.Add(new ReplayFileInfo
                    {
                        FilePath = file,
                        FileName = Path.GetFileName(file),
                        Timestamp = replay.RecordedAt,
                        PlayerCount = replay.PlayerCount,
                        TotalTurns = replay.TotalTurns,
                        WinnerName = replay.WinnerName,
                        DurationSeconds = replay.DurationSeconds
                    });
                }
            }
            catch (Exception e)
            {
                Debug.LogError($"Failed to read replay info: {e.Message}");
            }
        }
        
        return replayInfos;
    }

    public bool DeleteReplay(string filePath)
    {
        try
        {
            if (File.Exists(filePath))
            {
                File.Delete(filePath);
                Debug.Log($"Deleted replay: {filePath}");
                return true;
            }
            return false;
        }
        catch (Exception e)
        {
            Debug.LogError($"Failed to delete replay: {e.Message}");
            return false;
        }
    }

    public void DeleteAllReplays()
    {
        List<string> files = GetAllReplayFiles();
        foreach (string file in files)
        {
            DeleteReplay(file);
        }
    }

    public string GetReplayDirectory()
    {
        return _replayDirectory;
    }
}

[Serializable]
public class GameReplayData
{
    public string GameId;
    public DateTime RecordedAt;
    public int PlayerCount;
    public int TotalTurns;
    public string WinnerName;
    public int WinnerId;
    public float DurationSeconds;
    
    public List<GameSnapshot> Snapshots;
    public List<PlayerActionLog> ActionLogs;
    public List<string> PlayerNames;
}

[Serializable]
public class ReplayFileInfo
{
    public string FilePath;
    public string FileName;
    public DateTime Timestamp;
    public int PlayerCount;
    public int TotalTurns;
    public string WinnerName;
    public float DurationSeconds;
}
