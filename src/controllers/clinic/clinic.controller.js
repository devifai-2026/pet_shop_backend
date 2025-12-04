import ClinicAppointment from "../../models/clinic/clinic.model.js";
import { generateEmailHtml } from "../../services/templateUtils.js";
import ApiResponse from "../../utils/ApiResponse.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import handleMongoErrors from "../../utils/mongooseError.js";
import sendEmail from "./../../services/mailer.js";

// @access  Public
export const createClinicAppointment = asyncHandler(async (req, res) => {
  const { fullName, mobileNumber, email, serviceType, preferredDate } =
    req.body;

  // Validate required fields
  if (!fullName || !mobileNumber || !email || !serviceType || !preferredDate) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "All fields are required"));
  }

  // Additional validation for mobile number
  const cleanedMobile = mobileNumber.replace(/\D/g, "");
  if (cleanedMobile.length !== 10) {
    return res
      .status(400)
      .json(
        new ApiResponse(
          400,
          null,
          "Please enter a valid 10-digit mobile number"
        )
      );
  }

  // Validate date is in future
  const appointmentDate = new Date(preferredDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (appointmentDate <= today) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Preferred date must be in the future"));
  }

  try {
    // Check for existing appointments (optional - to prevent duplicates)
    const existingAppointment = await ClinicAppointment.findOne({
      email,
      preferredDate: {
        $gte: new Date(appointmentDate.setHours(0, 0, 0, 0)),
        $lt: new Date(appointmentDate.setHours(23, 59, 59, 999)),
      },
      status: { $in: ["pending", "confirmed"] },
    });

    if (existingAppointment) {
      return res
        .status(400)
        .json(
          new ApiResponse(
            400,
            null,
            "You already have an appointment scheduled for this date"
          )
        );
    }

    // Create appointment
    const appointment = await ClinicAppointment.create({
      fullName: fullName.trim(),
      mobileNumber: cleanedMobile,
      email: email.trim().toLowerCase(),
      serviceType,
      preferredDate: appointmentDate,
    });

    // Format date for email
    const formattedDate = appointmentDate.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    // Generate email content
    const emailContent = `
      <div style="margin-bottom: 20px;">
        <p>Dear ${fullName},</p>
        <p>Thank you for booking your grooming appointment with PetCare Clinic!</p>
        <p><strong>Appointment Details:</strong></p>
        <div style="background-color: #f8f9fa; padding: 15px; border-radius: 8px; margin: 15px 0;">
          <table style="width: 100%;">
            <tr>
              <td style="padding: 8px 0; font-weight: bold; width: 40%;">Service Type:</td>
              <td style="padding: 8px 0;">${serviceType}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold;">Appointment Date:</td>
              <td style="padding: 8px 0;">${formattedDate}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold;">Contact Number:</td>
              <td style="padding: 8px 0;">${mobileNumber}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold;">Reference ID:</td>
              <td style="padding: 8px 0; color: #007bff; font-weight: bold;">${appointment._id
                .toString()
                .slice(-8)
                .toUpperCase()}</td>
            </tr>
          </table>
        </div>
      </div>
      <div style="margin-bottom: 20px;">
        <p><strong>Important Instructions:</strong></p>
        <ul style="margin-left: 20px; margin-bottom: 20px;">
          <li>Please arrive 10 minutes before your scheduled appointment time</li>
          <li>Bring any previous medical records if available</li>
          <li>Make sure your pet hasn't eaten 2-3 hours before grooming (if applicable)</li>
          <li>Keep your pet on a leash or in a carrier</li>
        </ul>
        <p>We'll review your request and confirm your appointment shortly. If you need to reschedule or cancel, please contact us at least 24 hours in advance.</p>
      </div>
      <div style="background-color: #e8f4ff; padding: 15px; border-radius: 8px; margin-top: 20px;">
        <p style="margin: 0; font-weight: bold; color: #0056b3;">Need immediate assistance?</p>
        <p style="margin: 8px 0 0 0;">Call us at: <span style="color: #d63384; font-weight: bold;">+91 8655173958</span></p>
        <p style="margin: 8px 0 0 0;">Email: <span style="color: #d63384;">support@petcareclinic.com</span></p>
      </div>
    `;

    const emailHtml = await generateEmailHtml({
      customerName: fullName,
      emailContent: emailContent,
      subject: `Grooming Appointment Confirmation - ${formattedDate}`,
    });

    // Send confirmation email
    await sendEmail({
      to: email.trim().toLowerCase(),
      subject: `Grooming Appointment Confirmation - ${formattedDate}`,
      html: emailHtml,
    });

    return res.status(201).json(
      new ApiResponse(
        201,
        {
          appointment: appointment,
          message:
            "Appointment booked successfully. A confirmation email has been sent.",
        },
        "Clinic appointment created successfully"
      )
    );
  } catch (error) {
    console.error("Appointment creation error:", error);
    return handleMongoErrors(error, res);
  }
});

// @access  Private (Admin)
export const getAllClinicAppointments = asyncHandler(async (req, res) => {
  try {
    const {
      status,
      serviceType,
      fromDate,
      toDate,
      search,
      page = 1,
      limit = 10,
    } = req.query;

    const filter = {};

    // Status filter
    if (status) filter.status = status;

    // Service type filter
    if (serviceType) filter.serviceType = serviceType;

    // Date range filter
    if (fromDate || toDate) {
      filter.preferredDate = {};
      if (fromDate) filter.preferredDate.$gte = new Date(fromDate);
      if (toDate) filter.preferredDate.$lte = new Date(toDate);
    }

    // Search functionality (matches frontend's search by name, phone, email)
    if (search) {
      const searchRegex = new RegExp(search, "i");
      filter.$or = [
        { fullName: searchRegex },
        { mobileNumber: searchRegex },
        { email: searchRegex },
      ];
    }

    // Calculate skip for pagination
    const skip = (page - 1) * limit;

    // Get total count for pagination
    const total = await ClinicAppointment.countDocuments(filter);

    // Get paginated results
    const appointments = await ClinicAppointment.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    return res.status(200).json({
      success: true,
      data: appointments,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      message: "Clinic appointments retrieved successfully",
    });
  } catch (error) {
    return handleMongoErrors(error, res);
  }
});

// @access  Private (Admin)
export const getAppointmentById = asyncHandler(async (req, res) => {
  try {
    const appointment = await ClinicAppointment.findById(req.params.id);

    if (!appointment) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Appointment not found"));
    }

    return res
      .status(200)
      .json(
        new ApiResponse(200, appointment, "Appointment retrieved successfully")
      );
  } catch (error) {
    return handleMongoErrors(error, res);
  }
});

// @access  Private (Admin)
export const updateAppointmentStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;

  if (!["pending", "confirmed", "completed", "cancelled"].includes(status)) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Invalid status value"));
  }

  try {
    const appointment = await ClinicAppointment.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );

    if (!appointment) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Appointment not found"));
    }

    // Generate email content based on status
    let emailContent = `
      <h2>Appointment Status Update</h2>
      <p>Hello ${appointment.fullName},</p>
      <p>The status of your ${appointment.serviceType} appointment has been updated to <strong>${status}</strong>.</p>
    `;

    if (status === "confirmed") {
      emailContent += `
        <p><strong>Confirmed Appointment Details:</strong></p>
        <ul style="margin-left: 20px;">
          <li><strong>Service Type:</strong> ${appointment.serviceType}</li>
          <li><strong>Appointment Date:</strong> ${appointment.preferredDate.toLocaleDateString()}</li>
        </ul>
        <p>Please arrive 10 minutes before your scheduled time.</p>
      `;
    } else if (status === "cancelled") {
      emailContent += `
        <p>Please contact us if you'd like to reschedule or have any questions.</p>
      `;
    }

    emailContent += `<p>Thank you for choosing our clinic services!</p>`;

    const emailHtml = await generateEmailHtml({
      customerName: appointment.fullName,
      emailContent: emailContent,
      subject: `Update on Your ${appointment.serviceType} Appointment`,
    });

    await sendEmail({
      to: appointment.email,
      subject: `Update on Your ${appointment.serviceType} Appointment`,
      html: emailHtml,
    });

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          appointment,
          "Appointment status updated successfully"
        )
      );
  } catch (error) {
    return handleMongoErrors(error, res);
  }
});

// @access  Private (Admin)
export const deleteAppointment = asyncHandler(async (req, res) => {
  try {
    const appointment = await ClinicAppointment.findByIdAndDelete(
      req.params.id
    );

    if (!appointment) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Appointment not found"));
    }

    return res
      .status(200)
      .json(new ApiResponse(200, null, "Appointment deleted successfully"));
  } catch (error) {
    return handleMongoErrors(error, res);
  }
});
