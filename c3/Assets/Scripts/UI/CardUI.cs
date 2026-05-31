using UnityEngine;
using UnityEngine.UI;
using UnityEngine.EventSystems;
using UnityEngine.Events;

public class CardUI : MonoBehaviour, IPointerDownHandler, IDragHandler, IPointerUpHandler, IPointerEnterHandler, IPointerExitHandler
{
    public Text NameText;
    public Text CostText;
    public Text DescriptionText;
    public Image CardImage;
    public RectTransform RectTransform;
    public CanvasGroup CanvasGroup;
    public GameObject PlayIndicator;

    private CardData _cardData;
    private int _cardIndex;
    private PlayerNetworkObject _player;
    private Canvas _canvas;
    private bool _isDragging;
    private Vector3 _originalPosition;
    private Transform _originalParent;
    private bool _canInteract;

    public CardData CardData => _cardData;
    public int CardIndex => _cardIndex;

    private void Awake()
    {
        RectTransform = GetComponent<RectTransform>();
        _canvas = GetComponentInParent<Canvas>();
        
        if (CanvasGroup == null)
        {
            CanvasGroup = GetComponent<CanvasGroup>();
            if (CanvasGroup == null)
            {
                CanvasGroup = gameObject.AddComponent<CanvasGroup>();
            }
        }
    }

    public void Setup(CardData cardData, int cardIndex, PlayerNetworkObject player)
    {
        _cardData = cardData;
        _cardIndex = cardIndex;
        _player = player;

        UpdateUI();
        UpdateInteractivity();
    }

    private void UpdateUI()
    {
        if (NameText != null)
        {
            NameText.text = _cardData.Name;
        }

        if (CostText != null)
        {
            CostText.text = $"费用: {_cardData.Cost}";
        }

        if (DescriptionText != null)
        {
            DescriptionText.text = _cardData.Description;
        }

        if (CardImage != null)
        {
            CardImage.color = GetCardColor();
        }
    }

    private Color GetCardColor()
    {
        switch (_cardData.CardType)
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
            _canInteract = false;
        }
        else
        {
            _canInteract = _player.CanPlayCardType(_cardData.Effect);
        }

        if (CanvasGroup != null)
        {
            CanvasGroup.interactable = _canInteract;
            CanvasGroup.blocksRaycasts = true;
            CanvasGroup.alpha = _canInteract ? 1.0f : 0.6f;
        }

        if (PlayIndicator != null)
        {
            PlayIndicator.SetActive(_canInteract);
        }
    }

    public void OnPointerDown(PointerEventData eventData)
    {
        if (!_canInteract) return;
        if (_player == null) return;
        if (!_player.IsCurrentTurn.Value) return;
        if (_player.isServer)
        {
            if (!_player.IsCurrentTurn.Value) return;
        }

        _isDragging = true;
        _originalPosition = transform.position;
        _originalParent = transform.parent;

        transform.SetParent(_canvas.transform, true);
        transform.SetAsLastSibling();

        RectTransform.localScale = Vector3.one * 1.2f;

        if (CanvasGroup != null)
        {
            CanvasGroup.alpha = 0.9f;
        }
    }

    public void OnDrag(PointerEventData eventData)
    {
        if (!_isDragging) return;

        RectTransform.anchoredPosition += eventData.delta / _canvas.scaleFactor;
    }

    public void OnPointerUp(PointerEventData eventData)
    {
        if (!_isDragging) return;

        _isDragging = false;
        RectTransform.localScale = Vector3.one;

        if (CanvasGroup != null)
        {
            CanvasGroup.alpha = _canInteract ? 1.0f : 0.6f;
        }

        if (IsDraggedToPlayArea(eventData))
        {
            TryPlayCard();
        }
        else
        {
            transform.SetParent(_originalParent, false);
            transform.position = _originalPosition;
        }
    }

    private bool IsDraggedToPlayArea(PointerEventData eventData)
    {
        Vector2 localMousePos;
        RectTransformUtility.ScreenPointToLocalPointInRectangle(
            _canvas.GetComponent<RectTransform>(),
            eventData.position,
            null,
            out localMousePos
        );

        return localMousePos.y > 0;
    }

    private void TryPlayCard()
    {
        if (_player == null) return;
        if (!_player.IsCurrentTurn.Value)
        {
            ResetCardPosition();
            return;
        }

        if (_player.CanPlayCardType(_cardData.Effect))
        {
            _player.PlayCard(_cardIndex);
            Destroy(gameObject);
        }
        else
        {
            ResetCardPosition();
        }
    }

    private void ResetCardPosition()
    {
        if (_originalParent != null)
        {
            transform.SetParent(_originalParent, false);
        }
        transform.position = _originalPosition;
        UpdateInteractivity();
    }

    public void OnPointerEnter(PointerEventData eventData)
    {
        if (!_canInteract) return;
        if (RectTransform != null)
        {
            RectTransform.localScale = Vector3.one * 1.1f;
        }
    }

    public void OnPointerExit(PointerEventData eventData)
    {
        if (!_isDragging && RectTransform != null)
        {
            RectTransform.localScale = Vector3.one;
        }
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
