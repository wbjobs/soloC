`timescale 1ns / 1ps
`include "fpga_types.v"

import fpga_types::*;

module relu_unit (
    input logic clk,
    input logic rst_n,
    input logic en,
    input acc_t data_in,
    output data_t data_out,
    output logic valid
);

    acc_t clamped;
    data_t result;

    always_comb begin
        if (data_in < 0) begin
            clamped = 32'sh00000000;
        end else begin
            clamped = data_in;
        end
        
        if (clamped > 32'sh00FFFF) begin
            clamped = 32'sh00FFFF;
        end
        
        result = data_t'(clamped >>> FRAC_BITS);
    end

    always_ff @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            data_out <= '0;
            valid <= 1'b0;
        end else if (en) begin
            data_out <= result;
            valid <= 1'b1;
        end else begin
            data_out <= data_out;
            valid <= 1'b0;
        end
    end

endmodule
