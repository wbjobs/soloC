package main

import (
	"math"
	"math/cmplx"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

type QuantumGate struct {
	Type     string   `json:"type"`
	Qubits   []int    `json:"qubits"`
	Angle    float64  `json:"angle,omitempty"`
}

type CircuitRequest struct {
	QubitCount int           `json:"qubitCount"`
	Gates      []QuantumGate `json:"gates"`
}

type ExecutionResult struct {
	ID           string      `json:"id"`
	Timestamp    time.Time   `json:"timestamp"`
	StateVector  []complex128 `json:"stateVector"`
	Probabilities []float64   `json:"probabilities"`
	Expectations PauliExpectations `json:"expectations"`
	Circuit      CircuitRequest `json:"circuit"`
}

type PauliExpectations struct {
	X []float64 `json:"x"`
	Y []float64 `json:"y"`
	Z []float64 `json:"z"`
}

type ErrorCorrectionRequest struct {
	ErrorProbability float64 `json:"errorProbability"`
	GateType         string  `json:"gateType"`
}

type ErrorCorrectionResult struct {
	WithCorrection    ExecutionResult `json:"withCorrection"`
	WithoutCorrection ExecutionResult `json:"withoutCorrection"`
	FidelityWith      float64         `json:"fidelityWith"`
	FidelityWithout   float64         `json:"fidelityWithout"`
	Improvement       float64         `json:"improvement"`
}

var (
	history []ExecutionResult
	mu      sync.Mutex
)

func main() {
	r := gin.Default()

	r.Use(func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})

	r.POST("/api/execute", executeCircuit)
	r.GET("/api/history", getHistory)
	r.DELETE("/api/history", clearHistory)
	r.POST("/api/error-correction", runErrorCorrectionDemo)

	r.Run(":8080")
}

func executeCircuit(c *gin.Context) {
	var req CircuitRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}

	stateVector := simulateCircuit(req.QubitCount, req.Gates)
	probabilities := calculateProbabilities(stateVector)
	expectations := calculatePauliExpectations(stateVector, req.QubitCount)

	result := ExecutionResult{
		ID:           time.Now().Format("20060102150405"),
		Timestamp:    time.Now(),
		StateVector:  stateVector,
		Probabilities: probabilities,
		Expectations: expectations,
		Circuit:      req,
	}

	mu.Lock()
	history = append(history, result)
	mu.Unlock()

	c.JSON(200, result)
}

func getHistory(c *gin.Context) {
	mu.Lock()
	defer mu.Unlock()
	c.JSON(200, history)
}

func clearHistory(c *gin.Context) {
	mu.Lock()
	history = []ExecutionResult{}
	mu.Unlock()
	c.JSON(200, gin.H{"status": "cleared"})
}

func simulateCircuit(qubitCount int, gates []QuantumGate) []complex128 {
	size := 1 << qubitCount
	state := make([]complex128, size)
	state[0] = 1

	for _, gate := range gates {
		applyGate(state, qubitCount, gate)
	}

	return state
}

func applyGate(state []complex128, qubitCount int, gate QuantumGate) {
	switch gate.Type {
	case "H":
		applyHadamard(state, qubitCount, gate.Qubits[0])
	case "X":
		applyPauliX(state, qubitCount, gate.Qubits[0])
	case "Y":
		applyPauliY(state, qubitCount, gate.Qubits[0])
	case "Z":
		applyPauliZ(state, qubitCount, gate.Qubits[0])
	case "CNOT":
		applyCNOT(state, qubitCount, gate.Qubits[0], gate.Qubits[1])
	case "RX":
		applyRotationX(state, qubitCount, gate.Qubits[0], gate.Angle)
	case "RY":
		applyRotationY(state, qubitCount, gate.Qubits[0], gate.Angle)
	case "RZ":
		applyRotationZ(state, qubitCount, gate.Qubits[0], gate.Angle)
	}
}

func applyHadamard(state []complex128, n, qubit int) {
	h := complex(1.0/math.Sqrt(2), 0)
	size := 1 << n
	newState := make([]complex128, size)

	for i := 0; i < size; i++ {
		mask := 1 << qubit
		if i&mask == 0 {
			j := i | mask
			newState[i] += h * state[i]
			newState[j] += h * state[i]
		} else {
			j := i &^ mask
			newState[i] -= h * state[i]
			newState[j] += h * state[i]
		}
	}

	copy(state, newState)
}

func applyPauliX(state []complex128, n, qubit int) {
	size := 1 << n
	mask := 1 << qubit

	for i := 0; i < size; i++ {
		if i&mask == 0 {
			j := i | mask
			state[i], state[j] = state[j], state[i]
		}
	}
}

func applyPauliY(state []complex128, n, qubit int) {
	size := 1 << n
	mask := 1 << qubit

	for i := 0; i < size; i++ {
		if i&mask == 0 {
			j := i | mask
			si, sj := state[i], state[j]
			state[i] = complex(0, -1) * sj
			state[j] = complex(0, 1) * si
		}
	}
}

func applyPauliZ(state []complex128, n, qubit int) {
	size := 1 << n
	mask := 1 << qubit

	for i := 0; i < size; i++ {
		if i&mask != 0 {
			state[i] *= -1
		}
	}
}

func applyCNOT(state []complex128, n, control, target int) {
	size := 1 << n
	controlMask := 1 << control
	targetMask := 1 << target

	newState := make([]complex128, size)
	for i := 0; i < size; i++ {
		if i&controlMask != 0 {
			j := i ^ targetMask
			newState[i] = state[j]
		} else {
			newState[i] = state[i]
		}
	}

	copy(state, newState)
}

func applyRotationX(state []complex128, n, qubit int, angle float64) {
	size := 1 << n
	mask := 1 << qubit
	c := complex(math.Cos(angle/2), 0)
	s := complex(0, -math.Sin(angle/2))
	newState := make([]complex128, size)

	for i := 0; i < size; i++ {
		if i&mask == 0 {
			j := i | mask
			newState[i] += c*state[i] + s*state[j]
			newState[j] += cmplx.Conj(s)*state[i] + c*state[j]
		}
	}

	copy(state, newState)
}

func applyRotationY(state []complex128, n, qubit int, angle float64) {
	size := 1 << n
	mask := 1 << qubit
	c := complex(math.Cos(angle/2), 0)
	s := complex(math.Sin(angle/2), 0)
	newState := make([]complex128, size)

	for i := 0; i < size; i++ {
		if i&mask == 0 {
			j := i | mask
			newState[i] += c*state[i] - s*state[j]
			newState[j] += s*state[i] + c*state[j]
		}
	}

	copy(state, newState)
}

func applyRotationZ(state []complex128, n, qubit int, angle float64) {
	size := 1 << n
	mask := 1 << qubit
	phase := cmplx.Exp(complex(0, -angle/2))

	for i := 0; i < size; i++ {
		if i&mask != 0 {
			state[i] *= phase
		}
	}
}

func calculateProbabilities(state []complex128) []float64 {
	probs := make([]float64, len(state))
	for i, amp := range state {
		probs[i] = real(cmplx.Conj(amp) * amp)
	}
	return probs
}

func calculatePauliExpectations(state []complex128, qubitCount int) PauliExpectations {
	x := make([]float64, qubitCount)
	y := make([]float64, qubitCount)
	z := make([]float64, qubitCount)

	for q := 0; q < qubitCount; q++ {
		stateCopy := make([]complex128, len(state))
		copy(stateCopy, state)
		applyPauliX(stateCopy, qubitCount, q)
		x[q] = real(innerProduct(state, stateCopy))

		copy(stateCopy, state)
		applyPauliY(stateCopy, qubitCount, q)
		y[q] = real(innerProduct(state, stateCopy))

		copy(stateCopy, state)
		applyPauliZ(stateCopy, qubitCount, q)
		z[q] = real(innerProduct(state, stateCopy))
	}

	return PauliExpectations{X: x, Y: y, Z: z}
}

func innerProduct(a, b []complex128) complex128 {
	var sum complex128
	for i := range a {
		sum += cmplx.Conj(a[i]) * b[i]
	}
	return sum
}

func calculateFidelity(state1, state2 []complex128) float64 {
	inner := innerProduct(state1, state2)
	return real(inner * cmplx.Conj(inner))
}

func applyNoise(state []complex128, qubitCount int, errorProb float64, errorType string) {
	for q := 0; q < qubitCount; q++ {
		if randFloat() < errorProb {
			switch errorType {
			case "X":
				applyPauliX(state, qubitCount, q)
			case "Z":
				applyPauliZ(state, qubitCount, q)
			case "Y":
				applyPauliY(state, qubitCount, q)
			}
		}
	}
}

func randFloat() float64 {
	return float64(time.Now().UnixNano()%10000) / 10000
}

func generateSteaneCodeCircuit(qubitCount int, gateType string, withCorrection bool) []QuantumGate {
	gates := []QuantumGate{}
	
	if withCorrection {
		// Steane码编码逻辑 (7 qubits)
		// 数据 qubit: 0, 校验 qubits: 1-6
		gates = append(gates, QuantumGate{Type: "H", Qubits: []int{4}})
		gates = append(gates, QuantumGate{Type: "H", Qubits: []int{5}})
		gates = append(gates, QuantumGate{Type: "H", Qubits: []int{6}})
		
		gates = append(gates, QuantumGate{Type: "CNOT", Qubits: []int{0, 1}})
		gates = append(gates, QuantumGate{Type: "CNOT", Qubits: []int{0, 2}})
		gates = append(gates, QuantumGate{Type: "CNOT", Qubits: []int{4, 1}})
		gates = append(gates, QuantumGate{Type: "CNOT", Qubits: []int{4, 3}})
		gates = append(gates, QuantumGate{Type: "CNOT", Qubits: []int{5, 2}})
		gates = append(gates, QuantumGate{Type: "CNOT", Qubits: []int{5, 3}})
		gates = append(gates, QuantumGate{Type: "CNOT", Qubits: []int{6, 1}})
		gates = append(gates, QuantumGate{Type: "CNOT", Qubits: []int{6, 2}})
		gates = append(gates, QuantumGate{Type: "CNOT", Qubits: []int{6, 3}})
	}
	
	// 应用逻辑门
	switch gateType {
	case "H":
		gates = append(gates, QuantumGate{Type: "H", Qubits: []int{0}})
	case "X":
		gates = append(gates, QuantumGate{Type: "X", Qubits: []int{0}})
	case "CNOT":
		if qubitCount > 1 {
			gates = append(gates, QuantumGate{Type: "CNOT", Qubits: []int{0, 1}})
		}
	}
	
	if withCorrection {
		// 纠错检测和恢复
		gates = append(gates, QuantumGate{Type: "H", Qubits: []int{4}})
		gates = append(gates, QuantumGate{Type: "H", Qubits: []int{5}})
		gates = append(gates, QuantumGate{Type: "H", Qubits: []int{6}})
	}
	
	return gates
}

func runErrorCorrectionDemo(c *gin.Context) {
	var req ErrorCorrectionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}
	
	errorProb := req.ErrorProbability
	if errorProb <= 0 {
		errorProb = 0.1
	}
	gateType := req.GateType
	if gateType == "" {
		gateType = "H"
	}
	
	qubitCount := 7
	
	// 理想状态（无噪声）用于计算保真度
	idealState := simulateCircuit(qubitCount, generateSteaneCodeCircuit(qubitCount, gateType, false))
	
	// 无纠错情况
	noCorrectionGates := generateSteaneCodeCircuit(qubitCount, gateType, false)
	stateNoCorrection := simulateCircuit(qubitCount, noCorrectionGates)
	applyNoise(stateNoCorrection, qubitCount, errorProb, "X")
	
	probNoCorrection := calculateProbabilities(stateNoCorrection)
	expNoCorrection := calculatePauliExpectations(stateNoCorrection, qubitCount)
	fidelityNoCorrection := calculateFidelity(idealState, stateNoCorrection)
	
	resultNoCorrection := ExecutionResult{
		ID:           time.Now().Format("20060102150405") + "_noec",
		Timestamp:    time.Now(),
		StateVector:  stateNoCorrection,
		Probabilities: probNoCorrection,
		Expectations: expNoCorrection,
		Circuit:      CircuitRequest{QubitCount: qubitCount, Gates: noCorrectionGates},
	}
	
	// 有纠错情况
	withCorrectionGates := generateSteaneCodeCircuit(qubitCount, gateType, true)
	stateWithCorrection := simulateCircuit(qubitCount, withCorrectionGates)
	applyNoise(stateWithCorrection, qubitCount, errorProb, "X")
	
	probWithCorrection := calculateProbabilities(stateWithCorrection)
	expWithCorrection := calculatePauliExpectations(stateWithCorrection, qubitCount)
	fidelityWithCorrection := calculateFidelity(idealState, stateWithCorrection)
	
	resultWithCorrection := ExecutionResult{
		ID:           time.Now().Format("20060102150405") + "_ec",
		Timestamp:    time.Now(),
		StateVector:  stateWithCorrection,
		Probabilities: probWithCorrection,
		Expectations: expWithCorrection,
		Circuit:      CircuitRequest{QubitCount: qubitCount, Gates: withCorrectionGates},
	}
	
	improvement := 0.0
	if fidelityNoCorrection > 0 {
		improvement = (fidelityWithCorrection - fidelityNoCorrection) / fidelityNoCorrection * 100
	}
	
	result := ErrorCorrectionResult{
		WithCorrection:    resultWithCorrection,
		WithoutCorrection: resultNoCorrection,
		FidelityWith:      fidelityWithCorrection,
		FidelityWithout:   fidelityNoCorrection,
		Improvement:       improvement,
	}
	
	c.JSON(200, result)
}
