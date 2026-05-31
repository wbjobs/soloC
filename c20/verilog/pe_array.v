`timescale 1ns / 1ps
`include "fpga_types.v"

import fpga_types::*;

module pe_array #(
    parameter NUM_PE = 4
)(
    input logic clk,
    input logic rst_n,
    input logic en,
    input data_t [NUM_PE-1:0] data_in,
    input weight_t [NUM_PE-1:0] weight_in,
    input acc_t [NUM_PE-1:0] acc_in,
    output acc_t [NUM_PE-1:0] acc_out,
    output logic [NUM_PE-1:0] valid
);

    genvar i;
    generate
        for (i = 0; i < NUM_PE; i = i + 1) begin : pe_gen
            mac_unit mac_i (
                .clk(clk),
                .rst_n(rst_n),
                .en(en),
                .a(data_in[i]),
                .b(weight_in[i]),
                .c_in(acc_in[i]),
                .c_out(acc_out[i]),
                .valid(valid[i])
            );
        end
    endgenerate

endmodule
