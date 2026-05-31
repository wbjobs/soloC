package main

import (
	"fmt"
	"math"
	"math/cmplx"
)

func main() {
	fmt.Println("=== 测试CNOT门 ===")
	
	qubitCount := 3
	state := make([]complex128, 1<<qubitCount)
	state[0] = 1
	
	fmt.Println("初始状态:")
	printState(state)
	
	fmt.Println("\n1. 对qubit 0应用Hadamard门:")
	applyHadamard(state, qubitCount, 0)
	printState(state)
	
	fmt.Println("\n2. 应用CNOT门 (control=0, target=2) - 两个qubit距离为2:")
	applyCNOT(state, qubitCount, 0, 2)
	printState(state)
	
	fmt.Println("\n期望的贝尔态应该是: 0.707|000⟩ + 0.707|101⟩")
	fmt.Printf("实际 |000⟩ 概率: %.3f\n", real(cmplx.Conj(state[0])*state[0]))
	fmt.Printf("实际 |101⟩ 概率: %.3f\n", real(cmplx.Conj(state[5])*state[5]))
	
	if math.Abs(real(cmplx.Conj(state[0])*state[0])-0.5) < 0.01 &&
		math.Abs(real(cmplx.Conj(state[5])*state[5])-0.5) < 0.01 {
		fmt.Println("\n✅ CNOT门测试通过!")
	} else {
		fmt.Println("\n❌ CNOT门测试失败!")
	}
}

func printState(state []complex128) {
	for i, amp := range state {
		prob := real(cmplx.Conj(amp) * amp)
		if prob > 0.001 {
			fmt.Printf("  |%03b⟩: %.3f (%.1f%%)\n", i, real(amp), prob*100)
		}
	}
}
