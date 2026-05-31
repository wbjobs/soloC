`timescale 1ns / 1ps
`include "fpga_types.v"

import fpga_types::*;

module fpga_accelerator #(
    parameter NUM_PE = 4,
    parameter MAX_MATRIX_SIZE = 16
)(
    input logic clk,
    input logic rst_n,
    input logic start,
    input logic [31:0] matrix_size,
    input logic [31:0] num_layers,
    input data_t [MAX_MATRIX_SIZE*MAX_MATRIX_SIZE-1:0] input_data,
    input weight_t [MAX_MATRIX_SIZE*MAX_MATRIX_SIZE-1:0] weights [MAX_MATRIX_SIZE-1:0],
    input logic [31:0] bias [MAX_MATRIX_SIZE-1:0],
    output data_t [MAX_MATRIX_SIZE*MAX_MATRIX_SIZE-1:0] output_data,
    output logic done,
    output logic [63:0] cycle_count
);

    typedef enum logic [2:0] {
        IDLE,
        LOAD_DATA,
        COMPUTE,
        ACTIVATE,
        DONE
    } state_t;

    state_t current_state, next_state;
    logic [31:0] layer_counter, row_counter, col_counter;
    logic [63:0] cycle_counter;
    acc_t [MAX_MATRIX_SIZE-1:0] acc_buffer;
    data_t [MAX_MATRIX_SIZE*MAX_MATRIX_SIZE-1:0] current_input;
    data_t [MAX_MATRIX_SIZE*MAX_MATRIX_SIZE-1:0] current_output;
    logic pe_en, relu_en;
    logic [NUM_PE-1:0] pe_valid;
    data_t [NUM_PE-1:0] pe_data_in;
    weight_t [NUM_PE-1:0] pe_weight_in;
    acc_t [NUM_PE-1:0] pe_acc_in;
    acc_t [NUM_PE-1:0] pe_acc_out;
    data_t relu_data_out;
    logic relu_valid;

    pe_array #(.NUM_PE(NUM_PE)) pe_array_inst (
        .clk(clk),
        .rst_n(rst_n),
        .en(pe_en),
        .data_in(pe_data_in),
        .weight_in(pe_weight_in),
        .acc_in(pe_acc_in),
        .acc_out(pe_acc_out),
        .valid(pe_valid)
    );

    relu_unit relu_inst (
        .clk(clk),
        .rst_n(rst_n),
        .en(relu_en),
        .data_in(pe_acc_out[0]),
        .data_out(relu_data_out),
        .valid(relu_valid)
    );

    always_ff @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            current_state <= IDLE;
            layer_counter <= 0;
            row_counter <= 0;
            col_counter <= 0;
            cycle_counter <= 0;
            current_input <= '0;
            current_output <= '0;
        end else begin
            current_state <= next_state;
            if (current_state == COMPUTE || current_state == ACTIVATE) begin
                cycle_counter <= cycle_counter + 1;
            end
            case (current_state)
                IDLE: begin
                    if (start) begin
                        current_input <= input_data;
                        layer_counter <= 0;
                        row_counter <= 0;
                        col_counter <= 0;
                        cycle_counter <= 0;
                    end
                end
                COMPUTE: begin
                    if (col_counter == matrix_size - 1) begin
                        col_counter <= 0;
                        if (row_counter == matrix_size - 1) begin
                            row_counter <= 0;
                            layer_counter <= layer_counter + 1;
                        end else begin
                            row_counter <= row_counter + 1;
                        end
                    end else begin
                        col_counter <= col_counter + 1;
                    end
                end
                ACTIVATE: begin
                    if (relu_valid) begin
                        current_output[row_counter * matrix_size + col_counter] <= relu_data_out;
                        if (col_counter == matrix_size - 1) begin
                            col_counter <= 0;
                            if (row_counter == matrix_size - 1) begin
                                row_counter <= 0;
                                current_input <= current_output;
                            end else begin
                                row_counter <= row_counter + 1;
                            end
                        end else begin
                            col_counter <= col_counter + 1;
                        end
                    end
                end
            endcase
        end
    end

    always_comb begin
        next_state = current_state;
        pe_en = 1'b0;
        relu_en = 1'b0;
        done = 1'b0;

        case (current_state)
            IDLE: begin
                if (start) begin
                    next_state = LOAD_DATA;
                end
            end
            LOAD_DATA: begin
                next_state = COMPUTE;
            end
            COMPUTE: begin
                pe_en = 1'b1;
                if (&pe_valid) begin
                    next_state = ACTIVATE;
                end
            end
            ACTIVATE: begin
                relu_en = 1'b1;
                if (layer_counter >= num_layers) begin
                    next_state = DONE;
                end else if (col_counter == 0 && row_counter == 0) begin
                    next_state = COMPUTE;
                end
            end
            DONE: begin
                done = 1'b1;
                next_state = IDLE;
            end
        endcase
    end

    assign output_data = current_output;
    assign cycle_count = cycle_counter;

endmodule
