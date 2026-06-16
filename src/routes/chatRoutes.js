const express =
require('express');

const router =
express.Router();

const {authenticate}=require(
'../middlewares/authMiddleware'
);

const chatController =require(
'../controllers/chatController'
);

const conversationController =require(
'../controllers/conversationController'
);

router.use(
authenticate
);

router.post(
'/conversation',
conversationController
.createConversation
);

router.post(
'/message',
chatController
.sendMessage
);

router.get(
'/conversations',
conversationController.getConversations
);

router.get(
'/messages/:conversationId',
chatController.getMessages
);
router.get(
'/users/employees',
chatController.getAllEmployees
);
router.post(
  '/conversation/group',
  conversationController.createGroup
);
router.post('/conversation/add-participant', conversationController.addParticipant);
router.delete('/deleteParticipant',conversationController.deleteParticipant)
module.exports=router;