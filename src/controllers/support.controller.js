const fs = require('fs');
const path = require('path');
const supportService = require('../services/support.service');

function removeUploadedFile(file) {
  if (!file?.path) return;

  fs.unlink(path.resolve(file.path), () => {});
}

const createSupportTicket = async (req, res, next) => {
  try {
    const ticket = await supportService.createSupportTicket({
      body: req.body,
      file: req.file,
      ipAddress: req.ip,
      userAgent: req.get('user-agent') || ''
    });

    res.status(201).json({
      success: true,
      ticketNumber: ticket.ticketNumber,
      message: 'Support ticket submitted successfully.'
    });
  } catch (error) {
    removeUploadedFile(req.file);
    next(error);
  }
};

const listSupportTickets = async (req, res, next) => {
  try {
    const result = await supportService.listSupportTickets(req.query);
    res.status(200).json({
      success: true,
      ...result
    });
  } catch (error) {
    next(error);
  }
};

const getSupportTicket = async (req, res, next) => {
  try {
    const ticket = await supportService.getSupportTicketById(req.params.id);
    res.status(200).json({
      success: true,
      ticket
    });
  } catch (error) {
    next(error);
  }
};

const updateSupportTicket = async (req, res, next) => {
  try {
    const ticket = await supportService.updateSupportTicket(req.params.id, req.body);
    res.status(200).json({
      success: true,
      message: 'Support ticket updated successfully.',
      ticket
    });
  } catch (error) {
    next(error);
  }
};

const deleteSupportTicket = async (req, res, next) => {
  try {
    await supportService.deleteSupportTicket(req.params.id);
    res.status(200).json({
      success: true,
      message: 'Support ticket deleted successfully.'
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createSupportTicket,
  listSupportTickets,
  getSupportTicket,
  updateSupportTicket,
  deleteSupportTicket
};