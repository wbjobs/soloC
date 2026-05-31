#if UNITY_EDITOR
using UnityEngine;
using UnityEditor;
using System.IO;

public static class ProjectSetup
{
    [MenuItem("Tools/DeckBuilder/Create Required Folders")]
    public static void CreateRequiredFolders()
    {
        string[] folders = new string[]
        {
            "Assets/Prefabs",
            "Assets/Scenes",
            "Assets/Materials",
            "Assets/Textures",
            "Assets/Editor"
        };

        foreach (string folder in folders)
        {
            if (!Directory.Exists(folder))
            {
                Directory.CreateDirectory(folder);
                Debug.Log($"Created folder: {folder}");
            }
        }

        AssetDatabase.Refresh();
    }

    [MenuItem("Tools/DeckBuilder/Verify Setup")]
    public static void VerifySetup()
    {
        bool hasError = false;
        string errorMessage = "Setup verification:\n\n";

        string[] requiredFolders = new string[]
        {
            "Assets/Prefabs",
            "Assets/Scenes"
        };

        foreach (string folder in requiredFolders)
        {
            if (!Directory.Exists(folder))
            {
                errorMessage += $"❌ Missing folder: {folder}\n";
                hasError = true;
            }
        }

        string[] requiredScripts = new string[]
        {
            "Assets/Scripts/ECS/Data/CardData.cs",
            "Assets/Scripts/ECS/Data/PlayerData.cs",
            "Assets/Scripts/ECS/Data/CardFactory.cs",
            "Assets/Scripts/ECS/Systems/GameInitializationSystem.cs",
            "Assets/Scripts/ECS/Systems/CardDrawSystem.cs",
            "Assets/Scripts/ECS/Systems/CardPlaySystem.cs",
            "Assets/Scripts/ECS/Systems/PurchaseSystem.cs",
            "Assets/Scripts/ECS/Systems/TurnManagementSystem.cs",
            "Assets/Scripts/Networking/GameNetworkManager.cs",
            "Assets/Scripts/Networking/PlayerNetworkObject.cs",
            "Assets/Scripts/UI/UIManager.cs",
            "Assets/Scripts/UI/CardUI.cs",
            "Assets/Scripts/UI/ShopItemUI.cs",
            "Assets/Scripts/Gameplay/GameBootstrap.cs"
        };

        foreach (string script in requiredScripts)
        {
            if (!File.Exists(script))
            {
                errorMessage += $"❌ Missing script: {script}\n";
                hasError = true;
            }
        }

        if (!hasError)
        {
            errorMessage += "✅ All core scripts present!\n\n";
            errorMessage += "Next steps:\n";
            errorMessage += "1. Install Entities package from Package Manager\n";
            errorMessage += "2. Install Mirror from Asset Store or GitHub\n";
            errorMessage += "3. Create prefabs as described in README\n";
            errorMessage += "4. Create main scene with GameBootstrap\n";
        }

        if (hasError)
        {
            Debug.LogError(errorMessage);
            EditorUtility.DisplayDialog("Setup Verification Failed", errorMessage, "OK");
        }
        else
        {
            Debug.Log(errorMessage);
            EditorUtility.DisplayDialog("Setup Complete", errorMessage, "OK");
        }
    }

    [MenuItem("Tools/DeckBuilder/Quick Start Guide")]
    public static void ShowQuickStartGuide()
    {
        string guide = @"
DeckBuilder - Quick Start Guide
================================

1. INSTALL DEPENDENCIES:
   - Open Window > Package Manager
   - Search for 'Entities' and install
   - Download Mirror from Asset Store (https://assetstore.unity.com/packages/tools/network/mirror-129321)

2. CREATE PREFABS:
   a. Player Prefab:
      - Create empty GameObject
      - Add NetworkIdentity component
      - Add PlayerNetworkObject script
      - Save as Prefabs/Player.prefab

   b. CardUI Prefab:
      - Create UI Image as background
      - Add CardUI script
      - Add Text for Name, Cost, Description
      - Save as Prefabs/CardUI.prefab

   c. ShopItemUI Prefab:
      - Create UI Image as background
      - Add ShopItemUI script
      - Add Text for Name, Cost, Count, Description
      - Add Button for purchase
      - Save as Prefabs/ShopItemUI.prefab

   d. GameNetworkManager Prefab:
      - Create empty GameObject
      - Add NetworkManager component
      - Add GameNetworkManager script
      - Set Player Prefab reference
      - Save as Prefabs/GameNetworkManager.prefab

   e. UIManager Prefab:
      - Create Canvas with 4 panels
      - Add UIManager script
      - Setup all UI references
      - Save as Prefabs/UIManager.prefab

3. CREATE SCENE:
   - Create new scene
   - Add EventSystem
   - Create GameBootstrap GameObject
   - Add GameBootstrap script
   - Assign all prefab references
   - Save as Scenes/Main.unity

4. CONFIGURE PROJECT:
   - Edit > Project Settings > Player
   - Enable 'Run In Background'
   - Set Scripting Runtime Version to .NET 4.x

5. TEST GAME:
   - Start Unity Editor
   - Run Main scene
   - Press 'Host' to create room
   - Or enter IP and press 'Join'

For more details, see README.md
";

        Debug.Log(guide);
        EditorUtility.DisplayDialog("Quick Start Guide", guide, "OK");
    }
}
#endif
