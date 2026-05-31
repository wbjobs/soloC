using UnityEngine;
using UnityEngine.UI;
using UnityEngine.EventSystems;

public class ShopItemUI : MonoBehaviour, IPointerClickHandler, IPointerEnterHandler, IPointerExitHandler
{
    public Text NameText;
    public Text CostText;
    public Text CountText;
    public Text DescriptionText;
    public Image CardImage;
    public Button PurchaseButton;
    public CanvasGroup CanvasGroup;

    private ShopCardComponent _shopCard;
    private PlayerNetworkObject _player;
    private int _shopSlotIndex;
    private bool _canPurchase;

    public void Setup(ShopCardComponent shopCard, PlayerNetworkObject player)
    {
        _shopCard = shopCard;
        _player = player;
        _shopSlotIndex = shopCard.ShopSlotIndex;

        UpdateUI();
        UpdateInteractivity();
    }

    private void UpdateUI()
    {
        if (NameText != null)
        {
            NameText.text = _shopCard.CardData.Name;
        }

        if (CostText != null)
        {
            CostText.text = $"费用: {_shopCard.CardData.Cost}";
        }

        if (CountText != null)
        {
            CountText.text = $"剩余: {_shopCard.RemainingCount}";
        }

        if (DescriptionText != null)
        {
            DescriptionText.text = _shopCard.CardData.Description;
        }

        if (CardImage != null)
        {
            CardImage.color = GetCardColor();
        }
    }

    private Color GetCardColor()
    {
        switch (_shopCard.CardData.CardType)
        {
            case CardType.Copper:
                return new Color(0.8f, 0.5f, 0.2f); 
            case CardType.Silver:
                return new Color(0.7f, 0.7f, 0.7f); 
            case CardType.Gold:
                return new Color(1f, 0.84f, 0f); 
            case CardType.Estate:
            case CardType.Duchy:
            case CardType.Province:
                return new Color(0.3f, 0.8f, 0.3f); 
            case CardType.Market:
                return new Color(0.3f, 0.5f, 0.8f); 
            default:
                return Color.white;
        }
    }

    private void UpdateInteractivity()
    {
        if (_player == null)
        {
            _canPurchase = false;
        }
        else
        {
            _canPurchase = _player.CanPurchase(_shopCard.CardData.Cost);
        }

        if (CanvasGroup != null)
        {
            CanvasGroup.interactable = _canPurchase;
            CanvasGroup.blocksRaycasts = true;
            CanvasGroup.alpha = _canPurchase ? 1.0f : 0.6f;
        }

        if (PurchaseButton != null)
        {
            PurchaseButton.interactable = _canPurchase;
        }
    }

    public void OnPointerClick(PointerEventData eventData)
    {
        TryPurchase();
    }

    public void OnPurchaseButtonClicked()
    {
        TryPurchase();
    }

    private void TryPurchase()
    {
        if (_player == null) return;
        if (!_canPurchase) return;
        
        if (_player.IsCurrentTurn.Value && _player.GetTurnState() == TurnState.Buy)
        {
            _player.PurchaseCard(_shopSlotIndex);
        }
    }

    public void OnPointerEnter(PointerEventData eventData)
    {
        if (_canPurchase)
        {
            transform.localScale = Vector3.one * 1.05f;
        }
    }

    public void OnPointerExit(PointerEventData eventData)
    {
        transform.localScale = Vector3.one;
    }

    private void OnEnable()
    {
        if (_player != null)
        {
            _player.OnResourcesChanged += UpdateInteractivity;
        }
    }

    private void OnDisable()
    {
        if (_player != null)
        {
            _player.OnResourcesChanged -= UpdateInteractivity;
        }
    }
}
