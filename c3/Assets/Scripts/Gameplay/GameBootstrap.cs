using UnityEngine;

public class GameBootstrap : MonoBehaviour
{
    [SerializeField]
    private GameNetworkManager _networkManagerPrefab;

    [SerializeField]
    private GameObject _playerPrefab;

    [SerializeField]
    private UIManager _uiManagerPrefab;

    private void Awake()
    {
        Application.targetFrameRate = 60;
        Screen.sleepTimeout = SleepTimeout.NeverSleep;

        InitializeGame();
    }

    private void InitializeGame()
    {
        if (GameNetworkManager.Instance == null && _networkManagerPrefab != null)
        {
            GameNetworkManager networkManager = Instantiate(_networkManagerPrefab);
            networkManager.playerPrefab = _playerPrefab;
        }

        if (UIManager.Instance == null && _uiManagerPrefab != null)
        {
            Instantiate(_uiManagerPrefab);
        }
    }
}
