`timescale 1ns / 1ps
`include "fpga_types.v"

import fpga_types::*;

module mac_unit (
    input logic clk,
    input logic rst_n,
    input logic en,
    input data_t a,
    input weight_t b,
    input acc_t c_in,
    output acc_t c_out,
    output logic valid
);

    acc_t product;
    acc_t accumulator;

    always_comb begin
        product = acc_t'(a) * acc_t'(b);
        accumulator = c_in + product;
    end

    always_ff @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            c_out <= '0;
            valid <= 1'b0;
        end else if (en) begin
            c_out <= accumulator;
            valid <= 1'b1;
        end else begin
            c_out <= c_out;
            valid <= 1'b0;
        end
    end

endmodule
